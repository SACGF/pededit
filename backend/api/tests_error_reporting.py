"""Error reports must not carry pedigree data or pedigree links (#49).

Each test raises inside a real request with the fixture below in the body, the
locals, the exception message and the URL, lets the real
SDK build the item through the logging handler settings.py installs, keeps
the JSON it would have posted, and searches it for every secret. Nothing here
touches the network: the post itself is replaced.
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
from peded.error_reporting import (
    ErrorReportHandler, init_error_reporting, route_of, scrub_payload, scrub_text,
)

from .models import Pedigree
from .serializers import PedigreeSerializer

FAKE_TOKEN = "0123456789abcdef0123456789abcdef"

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


def _captured(posted) -> str:
    return "\n".join(posted)


def _items(posted) -> list:
    return [json.loads(p)["data"] for p in posted]


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
        import rollbar

        self.posted = []
        started = init_error_reporting(
            FAKE_TOKEN, environment="test", code_version="abc123", handler="blocking",
        )
        self.assertTrue(started)
        patcher = mock.patch.object(rollbar, "_send_payload", lambda body, token: self.posted.append(body))
        patcher.start()
        self.addCleanup(patcher.stop)
        handler = ErrorReportHandler()
        logging.getLogger().addHandler(handler)
        self.addCleanup(lambda: logging.getLogger().removeHandler(handler))
        self.addCleanup(lambda: rollbar.events.remove_payload_handler(scrub_payload))
        self.pedigree = Pedigree.objects.create(title=CHART_TITLE, data=PEDIGREE_DATA)
        self.uuid = str(self.pedigree.pk)
        # A signed-in request, so the item could carry a user and a live token.
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

        The test client skips `WSGIHandler.__call__`, which builds the
        request the way Gunicorn's would be, client address and all.
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
        return _captured(self.posted)

    def assertNoSecrets(self, text):
        self.assertTrue(text, "nothing was captured")
        for secret in self._secrets():
            self.assertNotIn(secret, text)

    def test_exception_in_a_pedigree_view(self):
        self.assertEqual(self._patch(), 500)
        text = self._sent()
        self.assertNoSecrets(text)

        items = _items(self.posted)
        self.assertEqual(len(items), 1, text)
        item = items[0]
        # Still useful: what failed, where, and on which route.
        trace = item["body"]["trace"]
        self.assertEqual(trace["exception"]["class"], "ValueError")
        self.assertTrue(trace["exception"]["message"].startswith("Cannot save [redacted]"), trace)
        self.assertEqual(trace["frames"][-1]["method"], "_failing_update")
        self.assertIn("raise ValueError", trace["frames"][-1]["code"])
        self.assertEqual(item["context"], "/api/pedigrees/{pk}/")
        self.assertEqual(item["request"], {"url": "/api/pedigrees/{pk}/", "method": "PATCH"})
        self.assertEqual(item["code_version"], "abc123")
        self.assertEqual(item["environment"], "test")

    def test_only_allowlisted_keys_are_sent(self):
        self._patch()
        self._sent()
        self.assertEqual(set(json.loads(self.posted[0])), {"access_token", "data"})
        item = _items(self.posted)[0]
        self.assertLessEqual(
            set(item),
            {"uuid", "timestamp", "environment", "level", "language", "framework", "code_version",
             "notifier", "body", "context", "request", "server"},
        )
        self.assertNotIn("person", item)
        self.assertEqual(item["server"], {})
        self.assertEqual(set(item["body"]), {"trace"})
        for frame in item["body"]["trace"]["frames"]:
            self.assertLessEqual(set(frame), {"filename", "method", "lineno", "colno", "code"})

    def test_message_without_quotes_and_with_a_detail_line(self):
        self._patch(_failing_update_unquoted)
        text = self._sent()
        self.assertNoSecrets(text)
        trace = _items(self.posted)[0]["body"]["trace"]
        self.assertEqual(trace["exception"]["message"], "pedigree [id] of [date] failed")

    def test_logged_errors(self):
        self.assertEqual(self._patch(_failing_update_logged), 200)
        text = self._sent()
        self.assertNoSecrets(text)
        messages = [i["body"]["message"]["body"] for i in _items(self.posted)]
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
        item = _items(self.posted)[0]
        self.assertEqual(item["context"], "[unmatched]")
        self.assertEqual(item["request"]["url"], "[unmatched]")

    def test_warnings_and_rollbars_own_errors_are_not_reported(self):
        logging.getLogger("api.views").warning("slow save of %s", NAME)
        logging.getLogger("rollbar").error("Exception while posting item %r", NAME)
        self.assertEqual(self.posted, [])

    def test_a_chained_exception(self):
        def failing(self_, instance, validated_data):
            try:
                raise KeyError(NAME)
            except KeyError as e:
                raise RuntimeError(f"could not save {instance.pk}") from e

        self._patch(failing)
        text = self._sent()
        self.assertNoSecrets(text)
        chain = _items(self.posted)[0]["body"]["trace_chain"]
        self.assertEqual([t["exception"]["class"] for t in chain], ["RuntimeError", "KeyError"])
        self.assertEqual(chain[1]["exception"]["message"], "[redacted]")


class ScrubPayloadTests(APITestCase):
    """`scrub_payload` alone, on an item carrying everything the SDK could attach."""

    UUID = "3f2b8c1e-9d4a-4e7b-8a6f-1c2d3e4f5a6b"

    def _hostile_payload(self):
        return {"access_token": FAKE_TOKEN, "data": {
            "uuid": "0" * 32, "timestamp": 1794790923, "environment": "production", "level": "error",
            "language": "python 3.13.0", "framework": "django", "code_version": "abc",
            "notifier": {"name": "pyrollbar", "version": "1.5.0", "note": NOTES},
            "context": f"/p/{SURNAME}/",
            "person": {"id": 42, "email": "counsellor@hospital.example", "username": "counsellor"},
            "request": {
                "url": f"https://pededit.example/api/pedigrees/{self.UUID}/",
                "method": "PATCH", "query_string": f"name={SURNAME}", "user_ip": "203.0.113.9",
                "body": json.dumps(PEDIGREE_DATA), "POST": PEDIGREE_DATA,
                "headers": {"Authorization": f"Bearer {TOKEN}", "Referer": f"/p/{self.UUID}",
                            "Cookie": f"sessionid={COOKIE}"},
            },
            "server": {"host": "clinic-server-7", "pid": 7, "argv": ["gunicorn", NAME], "root": "/opt"},
            "custom": {"pedigree": PEDIGREE_DATA},
            "fingerprint": NAME,
            "title": NAME,
            "attributes": [{"key": "session_id", "value": COOKIE}],
            "body": {"trace": {
                "exception": {"class": "ValueError", "message": f"bad name {NAME!r}", "description": NOTES},
                "frames": [{
                    "filename": "api/views.py", "method": "update", "lineno": 12,
                    "code": "    raise ValueError(name)",
                    "locals": {"name": NAME, "dob": DOB, "data": PEDIGREE_DATA},
                    "argspec": ["name"], "keywordspec": "kw", "varargspec": "args",
                }],
            }},
        }}

    def test_everything_not_allowlisted_is_dropped(self):
        text = json.dumps(scrub_payload(self._hostile_payload()))
        for secret in SECRETS + [self.UUID, "203.0.113.9", "hospital.example", "clinic-server-7"]:
            self.assertNotIn(secret, text)
        self.assertNotIn("locals", text)
        self.assertNotIn("argspec", text)

    def test_a_message_item_keeps_only_its_text(self):
        payload = {"access_token": FAKE_TOKEN, "data": {
            "body": {"message": {"body": f"saving '{NAME}'", "pedigree": PEDIGREE_DATA}},
            "custom": {"pedigree": PEDIGREE_DATA},
        }}
        out = scrub_payload(payload)["data"]
        self.assertEqual(out["body"], {"message": {"body": "saving [redacted]"}})

    def test_route_of(self):
        def req(route):
            return mock.Mock(resolver_match=mock.Mock(route=route) if route is not None else None)

        self.assertEqual(route_of(req("api/pedigrees/(?P<pk>[^/.]+)/$")), "/api/pedigrees/{pk}/")
        self.assertEqual(route_of(req("api/tag-presets/<int:pk>/")), "/api/tag-presets/{pk}/")
        # Shaped like a route but not one of ours: a typed path, not sent.
        self.assertEqual(route_of(req(f"p/{SURNAME}/")), "[unmatched]")
        self.assertEqual(route_of(req("api/health/")), "/api/health/")
        self.assertEqual(route_of(req(None)), "[unmatched]")
        self.assertEqual(route_of(object()), "[unmatched]")

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
    def test_no_token_or_debug_means_not_started(self):
        with mock.patch.dict(sys.modules):
            with mock.patch("builtins.__import__", side_effect=AssertionError("imported")):
                self.assertFalse(init_error_reporting(""))
                self.assertFalse(init_error_reporting(None))
                self.assertFalse(init_error_reporting(FAKE_TOKEN, debug=True))

    def test_a_mistyped_token_does_not_stop_django(self):
        with self.assertLogs("peded.error_reporting", level="WARNING"):
            self.assertFalse(init_error_reporting("not a token"))

    def test_django_starts_without_loading_the_sdk(self):
        # A fresh interpreter, because the tests above import rollbar here.
        if settings.DEBUG is False and getattr(__import__("site_config"), "ROLLBAR_ACCESS_TOKEN", ""):
            self.skipTest("this machine's site config turns error reporting on")
        code = (
            "import sys, django, os;"
            "os.environ['DJANGO_SETTINGS_MODULE']='peded.settings';"
            "django.setup();"
            "import peded.urls;"
            "loaded=[m for m in sys.modules if m.split('.')[0]=='rollbar'];"
            "sys.exit(1 if loaded else 0)"
        )
        result = subprocess.run(
            [sys.executable, "-c", code], cwd=Path(settings.BASE_DIR), capture_output=True, text=True
        )
        self.assertEqual(result.returncode, 0, result.stderr)


class TokenShapeTests(APITestCase):
    def test_accepts_32_and_96_character_tokens_and_nothing_else(self):
        import rollbar

        self.addCleanup(lambda: rollbar.events.remove_payload_handler(scrub_payload))
        self.assertTrue(init_error_reporting(FAKE_TOKEN, handler="blocking"))
        self.assertTrue(init_error_reporting(FAKE_TOKEN * 3, handler="blocking"))
        with self.assertLogs("peded.error_reporting", "WARNING"):
            self.assertFalse(init_error_reporting(FAKE_TOKEN[1:], handler="blocking"))
        with self.assertLogs("peded.error_reporting", "WARNING"):
            self.assertFalse(init_error_reporting(FAKE_TOKEN.upper(), handler="blocking"))
