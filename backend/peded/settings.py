from datetime import timedelta
from pathlib import Path
import site_config as _secrets

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY     = _secrets.SECRET_KEY
DEBUG          = _secrets.DEBUG
ALLOWED_HOSTS  = _secrets.ALLOWED_HOSTS

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    # Local
    "api",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",   # MUST be before CommonMiddleware
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "peded.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "peded.wsgi.application"

import environ
DATABASES = {
    "default": environ.Env().db_url_config(_secrets.DATABASE_URL)
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "djstatic/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── Health check ────────────────────────────────────────────────────────────
HEALTH_DISK_PATHS       = _secrets.HEALTH_DISK_PATHS
HEALTH_DISK_MIN_FREE_MB = _secrets.HEALTH_DISK_MIN_FREE_MB

# ── Logging ─────────────────────────────────────────────────────────────────
# runserver logs every request through django.server; keep the health check
# out of it the way Nginx and Gunicorn do in production (deploy/).
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "skip_health_checks": {
            "()": "django.utils.log.CallbackFilter",
            "callback": lambda record: "/api/health/" not in record.getMessage(),
        },
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
        "django.server": {
            "class": "logging.StreamHandler",
            "formatter": "django.server",
            "filters": ["skip_health_checks"],
        },
    },
    "formatters": {
        "django.server": {
            "()": "django.utils.log.ServerFormatter",
            "format": "[{server_time}] {message}",
            "style": "{",
        },
    },
    # Everything reaches the console through root. Error reporting (below)
    # adds its handler to root too, so it sees django.request's errors.
    "root": {"handlers": ["console"], "level": "WARNING"},
    "loggers": {
        "django": {"level": "INFO"},
        "django.server": {"handlers": ["django.server"], "level": "INFO", "propagate": False},
    },
}

# ── DRF ──────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    # Whose address a rate limit counts: the X-Forwarded-For entry this many
    # proxies from the end (api/throttling.py).
    "NUM_PROXIES": _secrets.NUM_PROXIES,
}

# ── Rate limits (api/throttling.py, #47) ─────────────────────────────────────
# Throttle classes are set on the views that need them, not as a default:
# reading and saving a pedigree are deliberately not limited.
THROTTLE_RATES = _secrets.THROTTLE_RATES

# The throttle counters are in the database so the Gunicorn workers share
# them (the default local-memory cache is one per worker) and a restart keeps
# them. Only sign-in and anonymous create touch it, so the extra query is on
# rare requests. `manage.py createcachetable` makes the table (deploy.sh runs
# it). MAX_ENTRIES is far above the default 300: culling a full cache deletes
# live counters, not only expired ones.
CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
    "throttle": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "throttle_cache",
        "OPTIONS": {"MAX_ENTRIES": 100000},
    },
}

# ── HTTPS: redirect, secure cookies, HSTS (#47) ──────────────────────────────
# Nothing is set unless the site config says "https": true.
from peded.security import security_settings
globals().update(security_settings(
    _secrets.HTTPS, _secrets.HSTS_SECONDS, _secrets.HSTS_INCLUDE_SUBDOMAINS,
))

# ── JWT ───────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = _secrets.CORS_ALLOWED_ORIGINS
CORS_ALLOW_HEADERS = [
    "accept",
    "authorization",
    "content-type",
    "x-csrftoken",
]

# ── Social auth ──────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID     = _secrets.GOOGLE_CLIENT_ID
GITHUB_CLIENT_ID     = _secrets.GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET = _secrets.GITHUB_CLIENT_SECRET

# ── Error reporting (#49) ────────────────────────────────────────────────────
# Does nothing, and imports nothing, without a rollbar_access_token in the
# site config. When on, every record logged at ERROR goes to Rollbar through
# the root logger, unhandled exceptions included (django.request logs them).
from peded.error_reporting import init_error_reporting
from peded.version import VERSION as _VERSION

if init_error_reporting(
    access_token=_secrets.ROLLBAR_ACCESS_TOKEN,
    environment=_secrets.ROLLBAR_ENVIRONMENT,
    code_version=_VERSION,
    debug=DEBUG,
):
    LOGGING["handlers"]["error_reporting"] = {"class": "peded.error_reporting.ErrorReportHandler"}
    LOGGING["root"]["handlers"].append("error_reporting")
