"""Rate limits (#47).

Limited: the sign-in endpoints, token refresh, and creating a pedigree without
an account, which is the one write anybody on the internet can make. Rates
come from `settings.THROTTLE_RATES` (site config `throttle_rates`).

Not limited, on purpose:

- Reading and saving an existing pedigree. Both need its UUID, auto-save
  PATCHes every few seconds, and a 429 on a save is a person's work not being
  stored. A flood there is a job for Nginx (`limit_req`), not for this.
- A caller on the box itself (no proxy headers, loopback address): the tests,
  local development, CI, the page checks and the end-to-end flows. In
  production every request arrives through Nginx with X-Forwarded-For, and a
  client cannot remove a header the proxy adds.
- The health check (`throttle_classes = []` in health.py).

The client address is the X-Forwarded-For entry chosen by
`REST_FRAMEWORK["NUM_PROXIES"]` (site config `num_proxies`). Get that wrong
and every user shares one bucket, see deploy/AGENTS.md.

Counters live in the "throttle" cache, a database table, because the default
local-memory cache is per Gunicorn worker: three workers would each allow the
full rate and a restart would forget everything.
"""

import logging

from django.conf import settings
from django.core.cache import caches
from django.db import DatabaseError
from rest_framework.throttling import SimpleRateThrottle

from .health import is_local_request

logger = logging.getLogger(__name__)


class ClientAddressThrottle(SimpleRateThrottle):
    """One bucket per client address and scope."""

    cache = caches["throttle"]

    def get_rate(self):
        # Read from our own setting on every request, not DRF's
        # DEFAULT_THROTTLE_RATES, which SimpleRateThrottle copies at import
        # and so ignores override_settings. A missing or null rate means no
        # limit.
        return settings.THROTTLE_RATES.get(self.scope)

    def applies_to(self, request, view):
        return True

    def get_cache_key(self, request, view):
        if not self.applies_to(request, view):
            return None
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}

    def allow_request(self, request, view):
        if is_local_request(request):
            return True
        try:
            return super().allow_request(request, view)
        except DatabaseError:
            # The cache table is missing (createcachetable not run) or the
            # database is struggling. Let the request through: a broken
            # limiter must not be what stops someone saving.
            logger.exception("throttle: cache unavailable, request allowed")
            return True


class AuthLoginThrottle(ClientAddressThrottle):
    """Google and GitHub sign-in. Each call makes requests to Google or
    GitHub on the caller's behalf, so it is what an abuser would lean on."""

    scope = "auth_login"


class AuthRefreshThrottle(ClientAddressThrottle):
    scope = "auth_refresh"


class _AnonCreateThrottle(ClientAddressThrottle):
    """POST /api/pedigrees/ with no account. Signed-in users are not limited:
    they are accountable, and their pedigrees can be found and removed."""

    def applies_to(self, request, view):
        if getattr(view, "action", None) != "create":
            return False
        return not (request.user and request.user.is_authenticated)


class AnonCreateBurstThrottle(_AnonCreateThrottle):
    scope = "anon_create_burst"


class AnonCreateSustainedThrottle(_AnonCreateThrottle):
    scope = "anon_create_sustained"
