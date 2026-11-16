from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path("admin/", admin.site.urls),
    # Auth: tokens are issued only by the Google and GitHub sign-in views
    # (api/social_auth.py). This renews one; there is no username and password
    # sign-in and no registration (#51).
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    # App
    path("api/", include("api.urls")),
]
