"""Error reporting to Sentry (#49), with pedigree data kept out of it.

Off unless the site config has a `sentry_dsn` and `debug` is false: with no
DSN `sentry_sdk` is not even imported, so nothing is loaded or sent in
development or on a server that has not opted in.

A pedigree is family health data, and the UUID in `/p/<uuid>` is the edit
capability for an anonymous pedigree (AGENTS.md, access rules). So an event is
not "what the SDK collected minus some fields": `scrub_event` builds a new
event from an allowlist and everything else the SDK attached is dropped.
Anything new you want on an event (a tag, a context, a breadcrumb) has to be
added to that allowlist, with a test in `api/tests_error_reporting.py` showing
it cannot carry pedigree content.

What is sent: the exception type, its message after `scrub_text`, the stack
(file, function, line and the source lines around it, never local variables),
the HTTP method and the URL *pattern* (`/api/pedigrees/{pk}/`, never the URL),
the release, the environment, and the Python and package versions.

What is never sent: request bodies, query strings, headers, cookies, the
user, the client IP, local variables, breadcrumbs (log lines and SQL are free
text), the host name and performance traces.
"""

from __future__ import annotations

import re

MAX_TEXT = 200
ID_PLACEHOLDER = "[id]"
UNMATCHED_ROUTE = "[unmatched]"

_UUID = re.compile(
    r"[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}"
)
_JWT = re.compile(r"eyJ[\w-]+\.[\w-]+(\.[\w-]+)?")
_EMAIL = re.compile(r"[^\s@<>()\[\]]+@[^\s@<>()\[\]]+")
_URL = re.compile(r"\b[a-z][a-z0-9+.-]*://\S+", re.IGNORECASE)
_DATE = re.compile(r"\b\d{1,4}[-/.]\d{1,2}([-/.]\d{1,4})?\b")
_LONG_NUMBER = re.compile(r"\d{4,}")
_QUOTES = "\"'`‘’“”"
_IDENTIFIER = re.compile(r"^[A-Za-z_][\w.]{0,99}$")
_ROUTE = re.compile(r"^[\w/{}.<>:^$?()\[\]+*\\|=!-]{1,200}$")


def scrub_text(text) -> str:
    """An exception or log message with anything that could be data removed.

    Messages are free text, so this cannot be an allowlist. It leans on how
    messages are written: Python, Postgres and the browsers quote the values
    they interpolate (`KeyError: 'John Smith'`, `invalid input syntax for type
    uuid: "..."`), so everything from the first quote to the last is dropped,
    and with a single unpaired quote everything after it. Only the first line
    is kept (Postgres puts row values on the DETAIL line). Ids, dates, long
    numbers, emails, URLs and tokens go wherever they are.
    """
    if not isinstance(text, str):
        return ""
    line = text.strip().split("\n", 1)[0]
    positions = [i for i, ch in enumerate(line) if ch in _QUOTES]
    if len(positions) == 1:
        line = line[: positions[0]] + "[redacted]"
    elif positions:
        line = line[: positions[0]] + "[redacted]" + line[positions[-1] + 1 :]
    line = _JWT.sub("[token]", line)
    line = _URL.sub("[url]", line)
    line = _EMAIL.sub("[email]", line)
    line = _UUID.sub(ID_PLACEHOLDER, line)
    line = _DATE.sub("[date]", line)
    line = _LONG_NUMBER.sub("[n]", line)
    return line[:MAX_TEXT]


def _identifier(value):
    """A dotted code name (exception type, module, logger), or None."""
    return value if isinstance(value, str) and _IDENTIFIER.match(value) else None


def _source_line(value):
    return value[:300] if isinstance(value, str) else None


def _scrub_frame(frame) -> dict:
    out = {}
    if not isinstance(frame, dict):
        return out
    # Source paths and lines are code, which is public; `vars` is not copied.
    for key in ("filename", "function", "module"):
        if isinstance(frame.get(key), str):
            out[key] = frame[key][:300]
    for key in ("lineno", "colno"):
        if isinstance(frame.get(key), int):
            out[key] = frame[key]
    if isinstance(frame.get("in_app"), bool):
        out["in_app"] = frame["in_app"]
    line = _source_line(frame.get("context_line"))
    if line is not None:
        out["context_line"] = line
    for key in ("pre_context", "post_context"):
        if isinstance(frame.get(key), list):
            out[key] = [l for l in map(_source_line, frame[key]) if l is not None]
    return out


def _scrub_exception(exc) -> dict:
    out = {}
    if not isinstance(exc, dict):
        return out
    out["type"] = _identifier(exc.get("type")) or "Error"
    module = _identifier(exc.get("module"))
    if module:
        out["module"] = module
    out["value"] = scrub_text(exc.get("value"))
    mechanism = exc.get("mechanism")
    if isinstance(mechanism, dict):
        out["mechanism"] = {
            "type": _identifier(mechanism.get("type")) or "generic",
            "handled": bool(mechanism.get("handled")),
        }
    frames = (exc.get("stacktrace") or {}).get("frames")
    if isinstance(frames, list):
        out["stacktrace"] = {"frames": [_scrub_frame(f) for f in frames]}
    return out


def _route(event) -> str:
    """The URL pattern Django matched, never the URL that was requested.

    The Django integration names the transaction after the matched route
    (`/api/pedigrees/{pk}/`) and says so in `transaction_info.source`. A path
    that matched nothing is whatever the client typed, so it is not sent.
    """
    source = (event.get("transaction_info") or {}).get("source")
    name = event.get("transaction")
    if source not in ("route", "component") or not isinstance(name, str):
        return UNMATCHED_ROUTE
    name = _UUID.sub(ID_PLACEHOLDER, name)
    return name if _ROUTE.match(name) else UNMATCHED_ROUTE


def scrub_event(event, hint=None):
    """`before_send`: rebuild the event from the allowlist. See the module doc."""
    if isinstance(hint, dict):
        hint["attachments"] = []
    out = {}
    for key in ("event_id", "timestamp", "platform", "level", "release", "environment"):
        if isinstance(event.get(key), str):
            out[key] = event[key]

    logger = _identifier(event.get("logger"))
    if logger:
        out["logger"] = logger

    values = (event.get("exception") or {}).get("values")
    if isinstance(values, list):
        out["exception"] = {"values": [_scrub_exception(v) for v in values]}

    # A logged error: the format string only, never its arguments.
    logentry = event.get("logentry")
    if isinstance(logentry, dict) and logentry.get("message"):
        out["logentry"] = {"message": scrub_text(logentry["message"])}
    elif isinstance(event.get("message"), str):
        out["logentry"] = {"message": scrub_text(event["message"])}

    request = event.get("request")
    if isinstance(request, dict):
        route = _route(event)
        out["transaction"] = route
        out["request"] = {"url": route}
        method = request.get("method")
        if isinstance(method, str) and re.fullmatch(r"[A-Z]{3,7}", method):
            out["request"]["method"] = method

    runtime = (event.get("contexts") or {}).get("runtime")
    if isinstance(runtime, dict):
        out["contexts"] = {
            "runtime": {
                k: runtime[k] for k in ("name", "version") if isinstance(runtime.get(k), str)
            }
        }

    modules = event.get("modules")
    if isinstance(modules, dict):
        out["modules"] = {
            k: v for k, v in modules.items() if isinstance(k, str) and isinstance(v, str)
        }

    sdk = event.get("sdk")
    if isinstance(sdk, dict):
        out["sdk"] = {k: sdk[k] for k in ("name", "version") if isinstance(sdk.get(k), str)}

    # Sentry fills an absent server_name and user in from the connection.
    out["server_name"] = ""
    out["user"] = {}
    return out


def drop(*_args, **_kwargs):
    """`before_breadcrumb` and `before_send_transaction`: nothing gets through."""
    return None


def init_error_reporting(dsn, environment="production", release=None, debug=False, transport=None) -> bool:
    """Start the Sentry SDK. Returns False, importing nothing, when it is off."""
    if not dsn or debug:
        return False

    import sentry_sdk
    from sentry_sdk.utils import BadDsn

    try:
        _init(sentry_sdk, dsn, environment, release, transport)
    except BadDsn as e:
        # A typo in the site config must not stop the site from starting.
        import logging

        logging.getLogger(__name__).warning("sentry_dsn is not a valid DSN, error reporting is off: %s", e)
        return False
    return True


def _init(sentry_sdk, dsn, environment, release, transport):
    sentry_sdk.init(
        dsn=dsn,
        environment=environment or "production",
        release=release,
        transport=transport,
        # Each of these is enforced again by scrub_event, so a changed default
        # in a later SDK cannot start sending something.
        send_default_pii=False,
        max_request_body_size="never",
        include_local_variables=False,
        max_breadcrumbs=0,
        before_send=scrub_event,
        before_breadcrumb=drop,
        before_send_transaction=drop,
        server_name="",
        # Errors only: no performance traces, profiles, sessions or logs.
        traces_sample_rate=None,
        profiles_sample_rate=None,
        auto_session_tracking=False,
        send_client_reports=False,
    )
