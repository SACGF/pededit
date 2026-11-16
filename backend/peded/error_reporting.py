"""Error reporting to Rollbar (#49), with pedigree data kept out of it.

Off unless the site config has a `rollbar_access_token` and `debug` is false:
with no token `rollbar` is not even imported, so nothing is loaded or sent in
development or on a server that has not opted in.

What gets reported: every record logged at ERROR or above, through
`ErrorReportHandler` on the root logger. That includes every unhandled
exception in a view, which Django logs on `django.request` with the request
attached. pyrollbar's own Django middleware is not used: it hands the SDK the
request, and the SDK would read the URL, headers and body from it.

A pedigree is family health data, and the UUID in `/p/<uuid>` is the edit
capability for an anonymous pedigree (AGENTS.md, access rules). So a report
is not "what the SDK collected minus some fields": `scrub_payload`, the last
step before a payload is posted, builds a new one from an allowlist and
everything else the SDK attached is dropped. Anything new you want on a
report (a custom field, a person, a fingerprint) has to be added to that
allowlist, with a test in `api/tests_error_reporting.py` showing it cannot
carry pedigree content.

What is sent: the exception class, its message after `scrub_text`, the stack
(file, function, line and that line of source, never local variables), the
HTTP method and the URL *pattern* (`/api/pedigrees/{pk}/`, never the URL) as
the item's context, the code version, the environment and the Python version.

What is never sent: request bodies, query strings, headers, cookies, the
user, the client IP, local variables, log arguments, the host name and the
process's command line.
"""

from __future__ import annotations

import logging
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
_TOKEN_SHAPE = re.compile(r"^[0-9a-f]{32}$")


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
    """A dotted code name (exception class, notifier name), or None."""
    return value if isinstance(value, str) and _IDENTIFIER.match(value) else None


def _source_line(value):
    return value[:300] if isinstance(value, str) else None


def _scrub_frame(frame) -> dict:
    out = {}
    if not isinstance(frame, dict):
        return out
    # Source paths and lines are code, which is public. `locals`, `argspec`,
    # `varargspec` and `keywordspec` (argument values) are not copied.
    for key in ("filename", "method"):
        if isinstance(frame.get(key), str):
            out[key] = frame[key][:300]
    for key in ("lineno", "colno"):
        if isinstance(frame.get(key), int) and not isinstance(frame.get(key), bool):
            out[key] = frame[key]
    code = _source_line(frame.get("code"))
    if code is not None:
        out["code"] = code
    return out


def _scrub_trace(trace) -> dict:
    if not isinstance(trace, dict):
        return {"frames": [], "exception": {"class": "Error", "message": ""}}
    exc = trace.get("exception") if isinstance(trace.get("exception"), dict) else {}
    frames = trace.get("frames") if isinstance(trace.get("frames"), list) else []
    return {
        "frames": [_scrub_frame(f) for f in frames],
        # `description` is free text the caller can add; it is not copied.
        "exception": {
            "class": _identifier(exc.get("class")) or "Error",
            "message": scrub_text(exc.get("message")),
        },
    }


def _scrub_body(body) -> dict:
    if not isinstance(body, dict):
        return {"message": {"body": ""}}
    if isinstance(body.get("trace_chain"), list):
        return {"trace_chain": [_scrub_trace(t) for t in body["trace_chain"]]}
    if "trace" in body:
        return {"trace": _scrub_trace(body["trace"])}
    message = body.get("message")
    # A logged error: the format string only, never its arguments, and none
    # of the extra keys the SDK copies in beside `body`.
    return {"message": {"body": scrub_text(message.get("body") if isinstance(message, dict) else None)}}


def _route_name(route: str) -> str:
    # DRF router regexes and path converters to `{name}`, as in the API docs:
    # `api/pedigrees/(?P<pk>[^/.]+)/$` and `p/<uuid:pk>/` become `/api/pedigrees/{pk}/`.
    route = re.sub(r"\(\?P<(\w+)>[^)]*\)", r"{\1}", route)
    route = re.sub(r"<(?:\w+:)?(\w+)>", r"{\1}", route)
    return "/" + route.replace("^", "").replace("$", "").lstrip("/")


_known = None


def known_routes() -> frozenset:
    """Every route in the URLconf, named as `route_of` names them."""
    global _known
    if _known is None:
        from django.urls import get_resolver

        names = set()

        def walk(patterns, prefix):
            for p in patterns:
                route = prefix + str(p.pattern)
                if hasattr(p, "url_patterns"):
                    walk(p.url_patterns, route)
                else:
                    names.add(_route_name(route))

        walk(get_resolver().url_patterns, "")
        _known = frozenset(names)
    return _known


def route_of(request) -> str:
    """The URL pattern Django matched, never the URL that was requested.

    `resolver_match` is only set once Django has matched a route. A request
    that failed before that (in middleware) or matched nothing has only the
    path the client typed, so its route is not sent.
    """
    match = getattr(request, "resolver_match", None)
    route = getattr(match, "route", None)
    if not isinstance(route, str):
        return UNMATCHED_ROUTE
    route = _route_name(route)
    return route if route in known_routes() else UNMATCHED_ROUTE


def scrub_payload(payload, **_kw):
    """The payload handler: rebuild the item from the allowlist. See the module doc."""
    if not isinstance(payload, dict):
        return False
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    out = {}
    for key in ("uuid", "environment", "level", "language", "framework", "code_version"):
        if isinstance(data.get(key), str):
            out[key] = data[key][:200]
    if isinstance(data.get("timestamp"), int):
        out["timestamp"] = data["timestamp"]

    notifier = data.get("notifier")
    if isinstance(notifier, dict):
        out["notifier"] = {k: notifier[k] for k in ("name", "version") if isinstance(notifier.get(k), str)}

    out["body"] = _scrub_body(data.get("body"))

    # Set by ErrorReportHandler from route_of(). Checked again here, against
    # the URLconf: anything else that put a context on the item could have
    # put a path, and `/p/<surname>/` looks just like a route.
    context = data.get("context")
    if isinstance(context, str) and (context == UNMATCHED_ROUTE or context in known_routes()):
        out["context"] = context
        out["request"] = {"url": out["context"]}
        method = (data.get("request") or {}).get("method") if isinstance(data.get("request"), dict) else None
        if isinstance(method, str) and re.fullmatch(r"[A-Z]{3,7}", method):
            out["request"]["method"] = method

    # The SDK fills in the host name, pid and argv; none of it is sent.
    out["server"] = {}
    return {"access_token": payload.get("access_token"), "data": out}


class ErrorReportHandler(logging.Handler):
    """Reports each record at ERROR or above to Rollbar. Added to the root logger by settings.py."""

    def __init__(self, level=logging.ERROR):
        super().__init__(level)

    def emit(self, record):
        # pyrollbar logs its own failures (an unreachable API, a bad token) at
        # ERROR. Reporting those would report the report, in a loop.
        if record.name == "rollbar" or record.name.startswith("rollbar."):
            return
        try:
            import rollbar

            request = getattr(record, "request", None)
            payload_data = {}
            if request is not None:
                payload_data["context"] = route_of(request)
                method = getattr(request, "method", None)
                if isinstance(method, str):
                    payload_data["request"] = {"method": method}
            level = "critical" if record.levelno >= logging.CRITICAL else "error"
            if record.exc_info and record.exc_info[0] is not None:
                rollbar.report_exc_info(record.exc_info, payload_data=payload_data, level=level)
            else:
                # The format string, not getMessage(): the arguments are where the data is.
                rollbar.report_message(record.msg if isinstance(record.msg, str) else "", level=level,
                                       payload_data=payload_data)
        except Exception:
            self.handleError(record)


def init_error_reporting(access_token, environment="production", code_version=None, debug=False,
                         handler="thread") -> bool:
    """Start pyrollbar. Returns False, importing nothing, when it is off.

    The caller (settings.py) adds `ErrorReportHandler` to the root logger when
    this returns True. `handler` is how pyrollbar posts: a thread per item in
    production, "blocking" in the tests.
    """
    if not access_token or debug:
        return False
    if not _TOKEN_SHAPE.match(access_token):
        # A typo in the site config must not stop the site from starting.
        logging.getLogger(__name__).warning(
            "rollbar_access_token is not a Rollbar access token (32 hex characters), error reporting is off"
        )
        return False

    import rollbar

    rollbar.init(
        access_token,
        environment=environment or "production",
        code_version=code_version,
        handler=handler,
        # Each of these is enforced again by scrub_payload, so a changed
        # default in a later SDK cannot start sending something.
        locals={"enabled": False},
        include_request_body=False,
        capture_ip=False,
        capture_email=False,
        capture_username=False,
        allow_logging_basic_config=False,
        log_payload_on_error=False,
        suppress_reinit_warning=True,
    )
    rollbar.events.add_payload_handler(scrub_payload)
    return True
