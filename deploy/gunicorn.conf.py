# Gunicorn configuration for the pededit service (loaded with -c by
# deploy/pededit.service). Keeps GET /api/health/ out of the access log: the
# deploy script and uptime monitors poll it, and the log should still show
# real traffic.
import logging

HEALTH_PATH = "/api/health/"


class _SkipHealthChecks(logging.Filter):
    def filter(self, record):
        return HEALTH_PATH not in record.getMessage()


def post_fork(server, worker):
    # Access lines are logged by the worker that served the request.
    logging.getLogger("gunicorn.access").addFilter(_SkipHealthChecks())
