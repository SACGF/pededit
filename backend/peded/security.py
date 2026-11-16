"""Settings that only make sense behind HTTPS (#47).

Kept as a function of the site config values so the switch can be tested:
`"https": false` (the default, and every development machine) returns nothing
and Django's own defaults stand; `"https": true` returns what
`manage.py check --deploy` asks for.
"""

# deploy.sh and anyone debugging on the box ask Gunicorn for the health check
# over plain HTTP on 127.0.0.1:8000. Redirecting that to https would make
# every deploy fail its health check.
HEALTH_REDIRECT_EXEMPT = r"^api/health/$"


def security_settings(https, hsts_seconds, hsts_include_subdomains):
    if not https:
        return {}
    silenced = [
        # security.W021, SECURE_HSTS_PRELOAD is off. Deliberate: preload puts
        # the domain in a list shipped with browsers, which takes months to
        # leave. That is the maintainer's decision to make by hand, not a
        # default.
        "security.W021",
    ]
    if not hsts_include_subdomains:
        # security.W005, only when the site config says
        # "hsts_include_subdomains": false, which is an explicit decision
        # (a subdomain that is still served over plain HTTP).
        silenced.append("security.W005")
    return {
        # Nginx terminates TLS and talks plain HTTP to Gunicorn, so Django
        # only knows a request was secure from X-Forwarded-Proto. Every proxy
        # location in deploy/pededit-nginx.conf sets it, which also replaces
        # anything the client sent. Without this pair agreeing,
        # SECURE_SSL_REDIRECT redirects https to https for ever.
        "SECURE_PROXY_SSL_HEADER": ("HTTP_X_FORWARDED_PROTO", "https"),
        "SECURE_SSL_REDIRECT": True,
        "SECURE_REDIRECT_EXEMPT": [HEALTH_REDIRECT_EXEMPT],
        "SESSION_COOKIE_SECURE": True,
        "CSRF_COOKIE_SECURE": True,
        "SECURE_HSTS_SECONDS": hsts_seconds,
        "SECURE_HSTS_INCLUDE_SUBDOMAINS": hsts_include_subdomains,
        "SILENCED_SYSTEM_CHECKS": silenced,
    }
