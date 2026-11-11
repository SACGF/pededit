"""GET /api/health/ (#50).

200 when the app can serve requests, 503 otherwise. Two checks: a database
round trip, and free disk space. The disk check exists because a full disk
does not fail `SELECT 1`: reads keep working while every save fails, so the
floor (`settings.HEALTH_DISK_MIN_FREE_MB`) turns the check red before writes
stop.

No authentication (a bad or expired token must not turn a healthy app into a
401), no throttling, and the deploy script and uptime monitors poll it, so
Nginx and Gunicorn are configured to keep it out of the access logs
(deploy/pededit-nginx.conf, deploy/gunicorn.conf.py).

The public answer says as little as a monitor needs. Errors and free-space
figures are logged, not returned. The git commit is returned only to a caller
on the box itself (deploy.sh), because the code is public and a commit tells
anyone exactly which fixes a server is missing.
"""

import logging
import shutil

from django.conf import settings
from django.db import connection
from django.http import HttpResponse
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from peded.version import VERSION

logger = logging.getLogger(__name__)

HEALTH_PATH = "/api/health/"

LOOPBACK_ADDRESSES = {"127.0.0.1", "::1"}
# Any of these means a proxy passed the request on, so the real client is
# somewhere else even though REMOTE_ADDR is loopback. The Nginx vhost sets
# X-Forwarded-Proto on every location, and a client cannot remove a header
# the proxy adds.
PROXY_HEADERS = ("HTTP_FORWARDED", "HTTP_X_REAL_IP", "HTTP_VIA")
PROXY_HEADER_PREFIX = "HTTP_X_FORWARDED_"


def database_ok() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            row = cursor.fetchone()
        return bool(row) and row[0] == 1
    except Exception:  # noqa: BLE001 - any failure means unhealthy
        logger.exception("health check: database round trip failed")
        return False


def disk_ok() -> bool:
    """False when any configured filesystem is below the free-space floor.

    A path that does not exist is skipped (the defaults name the Ubuntu
    Postgres directory, absent on a development machine). A path that cannot
    be read is logged and skipped: failing to measure is not the same as
    being full, and it must not take the site out of the monitor's good books.
    """
    floor = settings.HEALTH_DISK_MIN_FREE_MB * 1024 * 1024
    ok = True
    for path in settings.HEALTH_DISK_PATHS:
        try:
            free = shutil.disk_usage(path).free
        except FileNotFoundError:
            continue
        except OSError:
            logger.warning("health check: cannot read disk usage of %s", path, exc_info=True)
            continue
        if free < floor:
            logger.error(
                "health check: %s has %d MB free, below the %d MB floor",
                path, free // (1024 * 1024), settings.HEALTH_DISK_MIN_FREE_MB,
            )
            ok = False
    return ok


def is_local_request(request) -> bool:
    """True only for a caller on this machine talking to Gunicorn directly."""
    meta = request.META
    if meta.get("REMOTE_ADDR") not in LOOPBACK_ADDRESSES:
        return False
    return not any(k in PROXY_HEADERS or k.startswith(PROXY_HEADER_PREFIX) for k in meta)


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = []

    def check(self, request):
        db = database_ok()
        disk = disk_ok()
        healthy = db and disk
        body = {
            "status": "ok" if healthy else "error",
            "database": "ok" if db else "unavailable",
            "disk": "ok" if disk else "low",
        }
        if is_local_request(request):
            body["version"] = VERSION
        return body, 200 if healthy else 503

    def get(self, request):
        body, status = self.check(request)
        return Response(body, status=status)

    def head(self, request):
        # Uptime monitors send HEAD by default. Without this Django would run
        # get() and hand Gunicorn a body to drop, which it logs on every poll.
        _, status = self.check(request)
        return HttpResponse(status=status)
