"""GET /api/health/ (#50).

200 with the commit and a database round trip when the app can serve
requests, 503 otherwise. No authentication (a bad or expired token must not
turn a healthy app into a 401), no throttling, and the deploy script and
uptime monitors poll it, so Nginx and Gunicorn are configured to keep it out
of the access logs (deploy/pededit-nginx.conf, deploy/gunicorn.conf.py).
The database error itself is logged, not returned, so the public page does
not describe the server's internals.
"""

import logging

from django.db import connection
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from peded.version import VERSION

logger = logging.getLogger(__name__)

HEALTH_PATH = "/api/health/"


def database_ok() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            row = cursor.fetchone()
        return bool(row) and row[0] == 1
    except Exception:  # noqa: BLE001 - any failure means unhealthy
        logger.exception("health check: database round trip failed")
        return False


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = []

    def get(self, request):
        db_ok = database_ok()
        body = {
            "status": "ok" if db_ok else "error",
            "version": VERSION,
            "database": "ok" if db_ok else "unavailable",
        }
        return Response(body, status=200 if db_ok else 503)
