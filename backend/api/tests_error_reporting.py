"""Error reports must not carry pedigree data or pedigree links (#49).

Each test raises inside a real request with the fixture below in the body, the
locals, the exception message and the URL, sends the event through the real
SDK with a transport that keeps the envelope instead of posting it, and
searches the serialised bytes for every secret. Nothing here touches the
network: the DSN host is `.invalid` and the transport never sends.
"""

import io
import json
import logging
import subprocess
import sys
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.contrib.auth.models import User
from django.core.handlers.wsgi import WSGIHandler
from django.core.signals import request_finished, request_started
from django.db import close_old_connections
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from peded import error_reporting
from peded.error_reporting import init_error_reporting, scrub_event, scrub_text

from .models import Pedigree
from .serializers import PedigreeSerializer

FAKE_DSN = "https://publickey@errors.invalid/1"

NAME = "Wilhelmina Featherstonehaugh"
SURNAME = "Featherstonehaugh"
DOB = "1962-04-17"
NOTES = "Ovarian cancer at 41, declined testing"
CHART_TITLE = "Featherstonehaugh family"
REFERRAL = "Lynch syndrome query"
TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjo0Mn0.c2VjcmV0c2lnbmF0dXJl"
COOKIE = "sessionid-4f9a1c0de"
QUERY_VALUE = "searchterm-zebra"

PEDIGREE_DATA = {
    "individuals": [
        {"id": "i1", "sex": "female", "affected": True, "sibOrder": 0,
         "name": NAME, "dob": DOB, "notes": NOTES},
        {"id": "i2", "sex": "male", "affected": False, "sibOrder": 0, "name": "Bartholomew Quince"},
    ],
    "partnerships": [{"id": "p1", "individual1": "i2", "individual2": "i1"}],
    "parentOf": {},
    "chartTitle": CHART_TITLE,
    "clinicalDetails": {"referralReason": REFERRAL},
}

SECRETS = [NAME, SURNAME, "Wilhelmina", "Bartholomew", "Quince", DOB, "1962", NOTES,
           "Ovarian", CHART_TITLE, REFERRAL, "Lynch", TOKEN, TOKEN.split(".")[1],
           COOKIE, QUERY_VALUE]


class CapturingTransport:
    """Keeps what the SDK would have posted. Built lazily: no sentry import at module load."""

    def __new__(cls, envelopes):
        from sentry_sdk.transport import Transport

        class _Capturing(Transport):
            def capture_envelope(self, envelope):
                envelopes.append(envelope)

            def flush(self, timeout, callback=None):
                pass

            def kill(self):
                pass

        return _Capturing


def _serialise(envelopes) -> str:
    return b"\n".join(e.serialize() for e in envelopes).decode("utf-8", "replace")


def _events(envelopes) -> list:
    return [item.get_event() for e in envelopes for item in e.items if item.get_event()]


def _failing_update(self, instance, validated_data):
    # Locals the SDK would send as frame variables if it were allowed to.
    person = validated_data["data"]["individuals"][0]
    patient_name = person["name"]
    date_of_birth = person["dob"]
    notes = person["notes"]
    pedigree_id = str(instance.pk)
    raise ValueError(f"Cannot save {patient_name!r} born {date_of_birth} ({notes!r}) in {pedigree_id}")


def _failing_update_unquoted(self, instance, validated_data):
    raise RuntimeError(
        f"pedigree {instance.pk} of {DOB} failed\nDETAIL: Key (name)=({NAME}) is too long"
    )


def _failing_update_logged(self, instance, validated_data):
    name = validated_data["data"]["individuals"][0]["name"]
    logging.getLogger("api.views").error("Could not save pedigree %s for %s", instance.pk, name)
    logging.getLogger("api.views").error(f"Could not save '{name}' in {instance.pk}")
    return instance


class ErrorReportScrubbingTests(APITestCase):
    def setUp(self):
        import sentry_sdk

        self.envelopes = []
        started = init_error_reporting(
            FAKE_DSN, environment="test", release="abc123",
            transport=CapturingTransport(self.envelopes),
        )
        self.assertTrue(started)
        self.addCleanup(lambda: sentry_sdk.get_global_scope().set_client(None))
        self.addCleanup(lambda: sentry_sdk.get_client().close())
        self.pedigree = Pedigree.objects.create(title=CHART_TITLE, data=PEDIGREE_DATA)
        self.uuid = str(self.pedigree.pk)
        # A signed-in request, so the event could carry a user and a live token.
        self.user = User.objects.create_user("counsellor", email="counsellor@hospital.example")
        self.token = str(AccessToken.for_user(self.user))

    def _secrets(self):
        return SECRETS + [
            "203.0.113.9", "pededit.example",
            self.uuid, self.uuid.replace("-", ""), self.uuid.upper(),
            self.token, self.token.split(".")[1], self.token.split(".")[2],
            "counsellor", "hospital.example",
        ]

    def _request(self, method, path, body=None, query=""):
        """One request through the real WSGI handler, as Gunicorn calls it.

        The test client skips `WSGIHandler.__call__`, which is where the SDK
        reads the URL, query string, headers and client address.
        """
        payload = json.dumps(body).encode() if body is not None else b""
        environ = self.client._base_environ(
            REQUEST_METHOD=method, PATH_INFO=path, QUERY_STRING=query,
            CONTENT_TYPE="application/json", CONTENT_LENGTH=str(len(payload)),
            REMOTE_ADDR="203.0.113.9",
            HTTP_AUTHORIZATION=f"Bearer {self.token}",
            HTTP_COOKIE=f"sessionid={COOKIE}",
            HTTP_REFERER=f"https://pededit.example/p/{self.uuid}",
            HTTP_X_FORWARDED_FOR="203.0.113.9",
        )
        environ["wsgi.input"] = io.BytesIO(payload)
        status = []
        # As the test client does: the handler must not close the test's connection.
        request_started.disconnect(close_old_connections)
        request_finished.disconnect(close_old_connections)
        try:
            response = WSGIHandler()(environ, lambda s, headers: status.append(s))
            b"".join(response)
            response.close()
        finally:
            request_started.connect(close_old_connections)
            request_finished.connect(close_old_connections)
        return int(status[0].split()[0])

    def _patch(self, failing=_failing_update):
        with mock.patch.object(PedigreeSerializer, "update", failing):
            return self._request(
                "PATCH", f"/api/pedigrees/{self.uuid}/",
                {"title": CHART_TITLE, "data": PEDIGREE_DATA}, query=f"q={QUERY_VALUE}",
            )

    def _sent(self):
        import sentry_sdk

        sentry_sdk.flush()
        return _serialise(self.envelopes)

    def assertNoSecrets(self, text):
        self.assertTrue(text, "nothing was captured")
        for secret in self._secrets():
            self.assertNotIn(secret, text)

    def test_exception_in_a_pedigree_view(self):
        self.assertEqual(self._patch(), 500)
        text = self._sent()
        self.assertNoSecrets(text)

        events = _events(self.envelopes)
        self.assertEqual(len(events), 1, text)
        event = events[0]
        # Still useful: what failed, where, and on which route.
        exc = event["exception"]["values"][-1]
        self.assertEqual(exc["type"], "ValueError")
        self.assertTrue(exc["value"].startswith("Cannot save [redacted]"), exc["value"])
        frames = exc["stacktrace"]["frames"]
        self.assertEqual(frames[-1]["function"], "_failing_update")
        self.assertIn("raise ValueError", frames[-1]["context_line"])
        self.assertEqual(event["transaction"], "/api/pedigrees/{pk}/")
        self.assertEqual(event["request"], {"url": "/api/pedigrees/{pk}/", "method": "PATCH"})
        self.assertEqual(event["release"], "abc123")
        self.assertEqual(event["environment"], "test")

    def test_only_allowlisted_keys_are_sent(self):
        self._patch()
        self._sent()
        event = _events(self.envelopes)[0]
        self.assertLessEqual(
            set(event),
            {"event_id", "timestamp", "platform", "level", "release", "environment", "logger",
             "exception", "logentry", "transaction", "request", "contexts", "modules", "sdk",
             "server_name", "user"},
        )
        self.assertEqual(event["user"], {})
        self.assertEqual(event["server_name"], "")
        self.assertEqual(set(event["contexts"]), {"runtime"})
        for exc in event["exception"]["values"]:
            for frame in exc["stacktrace"]["frames"]:
                self.assertLessEqual(
                    set(frame),
                    {"filename", "function", "module", "lineno", "colno", "in_app",
                     "context_line", "pre_context", "post_context"},
                )
        # One envelope item per event: no attachments, sessions or transactions.
        for envelope in self.envelopes:
            self.assertEqual([item.type for item in envelope.items], ["event"])

    def test_message_without_quotes_and_with_a_detail_line(self):
        self._patch(_failing_update_unquoted)
        text = self._sent()
        self.assertNoSecrets(text)
        exc = _events(self.envelopes)[0]["exception"]["values"][-1]
        self.assertEqual(exc["value"], "pedigree [id] of [date] failed")

    def test_logged_errors(self):
        self.assertEqual(self._patch(_failing_update_logged), 200)
        text = self._sent()
        self.assertNoSecrets(text)
        messages = [e["logentry"]["message"] for e in _events(self.envelopes)]
        self.assertEqual(
            messages, ["Could not save pedigree %s for %s", "Could not save [redacted] in [id]"]
        )

    def test_a_path_that_matches_no_route_is_not_sent(self):
        with mock.patch(
            "django.middleware.common.CommonMiddleware.process_request",
            side_effect=RuntimeError("boom"),
        ):
            self._request("GET", f"/p/{self.uuid}/{SURNAME}/", query=f"name={SURNAME}")
        text = self._sent()
        self.assertNoSecrets(text)
        event = _events(self.envelopes)[0]
        self.assertEqual(event["transaction"], "[unmatched]")
        self.assertEqual(event["request"]["url"], "[unmatched]")

    def test_no_breadcrumbs_or_traces(self):
        import sentry_sdk

        sentry_sdk.add_breadcrumb(category="query", message=f"SELECT ... WHERE name = '{NAME}'")
        with sentry_sdk.start_transaction(name=f"/p/{self.uuid}"):
            pass
        self._patch()
        text = self._sent()
        self.assertNoSecrets(text)
        self.assertNotIn("breadcrumbs", text)
        for envelope in self.envelopes:
            self.assertEqual([item.type for item in envelope.items], ["event"])


class ScrubEventTests(APITestCase):
    """`scrub_event` alone, on an event carrying everything the SDK could attach."""

    UUID = "3f2b8c1e-9d4a-4e7b-8a6f-1c2d3e4f5a6b"

    def _hostile_event(self):
        return {
            "event_id": "0" * 32, "timestamp": "2026-11-16T00:00:00Z", "platform": "python",
            "level": "error", "release": "abc", "environment": "production",
            "server_name": "clinic-server-7", "transaction": f"/api/pedigrees/{self.UUID}/",
            "transaction_info": {"source": "url"},
            "user": {"id": 42, "email": "counsellor@hospital.example", "ip_address": "203.0.113.9"},
            "request": {
                "url": f"https://pededit.example/api/pedigrees/{self.UUID}/",
                "method": "PATCH", "query_string": f"name={SURNAME}",
                "data": PEDIGREE_DATA, "cookies": {"sessionid": COOKIE},
                "headers": {"Authorization": f"Bearer {TOKEN}", "Referer": f"/p/{self.UUID}"},
                "env": {"REMOTE_ADDR": "203.0.113.9"},
            },
            "breadcrumbs": {"values": [{"message": NOTES, "data": {"url": f"/p/{self.UUID}"}}]},
            "extra": {"pedigree": PEDIGREE_DATA, "sys.argv": ["manage.py"]},
            "tags": {"patient": NAME},
            "contexts": {"runtime": {"name": "CPython", "version": "3.13.0", "build": NAME},
                         "pedigree": PEDIGREE_DATA},
            "exception": {"values": [{
                "type": "ValueError", "module": "builtins", "value": f"bad name {NAME!r}",
                "mechanism": {"type": "django", "handled": False, "data": {"note": NOTES}},
                "stacktrace": {"frames": [{
                    "filename": "api/views.py", "function": "update", "lineno": 12, "in_app": True,
                    "context_line": "    raise ValueError(name)",
                    "vars": {"name": NAME, "dob": DOB, "data": PEDIGREE_DATA},
                }]},
            }]},
            "threads": {"values": [{"name": NAME}]},
            "fingerprint": [NAME],
        }

    def test_everything_not_allowlisted_is_dropped(self):
        hint = {"attachments": [NOTES]}
        text = json.dumps(scrub_event(self._hostile_event(), hint))
        for secret in SECRETS + [self.UUID, "203.0.113.9", "hospital.example", "clinic-server-7"]:
            self.assertNotIn(secret, text)
        self.assertNotIn("vars", text)
        self.assertEqual(hint["attachments"], [])

    def test_scrub_text(self):
        cases = {
            f"Pedigree {self.UUID} not found": "Pedigree [id] not found",
            f"Pedigree {self.UUID.replace('-', '')} not found": "Pedigree [id] not found",
            "KeyError: 'Jane Smith'": "KeyError: [redacted]",
            'invalid input for "John" and "Jane" here': "invalid input for [redacted] here",
            "can't find John Smith": "can[redacted]",
            "born 1950-03-01, seen 3/4/2021": "born [date], seen [date]",
            "b. 1978": "b. [n]",
            "mail jane@example.org now": "mail [email] now",
            f"GET https://pededit.com/p/{self.UUID}?x=1 failed": "GET [url] failed",
            f"Bearer {TOKEN}": "Bearer [token]",
            "first line\nDETAIL: Key (name)=(John)": "first line",
            "Pedigree matching query does not exist.": "Pedigree matching query does not exist.",
            "status 500": "status 500",
        }
        for raw, want in cases.items():
            self.assertEqual(scrub_text(raw), want, raw)
        self.assertEqual(scrub_text(None), "")
        self.assertEqual(scrub_text({"name": NAME}), "")
        self.assertLessEqual(len(scrub_text("x" * 5000)), error_reporting.MAX_TEXT)


class ErrorReportingOffTests(APITestCase):
    def test_no_dsn_or_debug_means_not_started(self):
        with mock.patch.dict(sys.modules):
            with mock.patch("builtins.__import__", side_effect=AssertionError("imported")):
                self.assertFalse(init_error_reporting(""))
                self.assertFalse(init_error_reporting(None))
                self.assertFalse(init_error_reporting(FAKE_DSN, debug=True))

    def test_a_mistyped_dsn_does_not_stop_django(self):
        with self.assertLogs("peded.error_reporting", level="WARNING"):
            self.assertFalse(init_error_reporting("not a dsn"))

    def test_django_starts_without_loading_the_sdk(self):
        # A fresh interpreter, because the tests above import sentry_sdk here.
        if settings.DEBUG is False and getattr(__import__("site_config"), "SENTRY_DSN", ""):
            self.skipTest("this machine's site config turns error reporting on")
        code = (
            "import sys, django, os;"
            "os.environ['DJANGO_SETTINGS_MODULE']='peded.settings';"
            "django.setup();"
            "import peded.urls;"
            "loaded=[m for m in sys.modules if m.split('.')[0]=='sentry_sdk'];"
            "sys.exit(1 if loaded else 0)"
        )
        result = subprocess.run(
            [sys.executable, "-c", code], cwd=Path(settings.BASE_DIR), capture_output=True, text=True
        )
        self.assertEqual(result.returncode, 0, result.stderr)
