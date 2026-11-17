from django.contrib import admin
from django.urls import path, include

from api.throttling import AuthRefreshThrottle
from api.views import RefreshView

urlpatterns = [
    path("admin/", admin.site.urls),
    # Auth: tokens are issued only by the Google and GitHub sign-in views
    # (api/social_auth.py). This renews one; there is no username and password
    # sign-in and no registration (#51).
    path("api/auth/token/refresh/", RefreshView.as_view(throttle_classes=[AuthRefreshThrottle]), name="token_refresh"),
    # App
    path("api/", include("api.urls")),
]
