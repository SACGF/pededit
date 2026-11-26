"""
Social authentication views.

Google: receives an ID token from the frontend, verifies it with Google,
        finds-or-creates a Django user, returns a simplejwt token pair.

GitHub: receives an authorization code from the frontend, exchanges it for
        an access token, fetches the user's profile and email, finds-or-creates
        a Django user, returns a simplejwt token pair.
"""

import requests as http_requests
from django.conf import settings
from django.contrib.auth.models import User
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token as google_id_token
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .throttling import AuthLoginThrottle


def _jwt_pair(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def _user_for(email, name):
    """The user with this email, made on first sign-in. A name from the
    provider fills in a user who has none yet; it never replaces one."""
    first, *rest = name.split() or [""]
    user, created = User.objects.get_or_create(
        email=email,
        defaults={"username": email, "first_name": first, "last_name": " ".join(rest)},
    )
    if not created and not user.first_name and first:
        user.first_name = first
        user.last_name = " ".join(rest)
        user.save(update_fields=["first_name", "last_name"])
    return user


# ── Google ───────────────────────────────────────────────────────────────────


class GoogleLoginSerializer(serializers.Serializer):
    credential = serializers.CharField()


class GoogleLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthLoginThrottle]

    def post(self, request):
        ser = GoogleLoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        try:
            idinfo = google_id_token.verify_oauth2_token(
                ser.validated_data["credential"],
                GoogleRequest(),
                settings.GOOGLE_CLIENT_ID,
            )
        except ValueError:
            return Response(
                {"detail": "Invalid Google token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = _user_for(idinfo["email"], idinfo.get("name", ""))
        return Response(_jwt_pair(user))


# ── GitHub ───────────────────────────────────────────────────────────────────


class GitHubLoginSerializer(serializers.Serializer):
    code = serializers.CharField()


class GitHubLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthLoginThrottle]

    def post(self, request):
        ser = GitHubLoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        # Exchange code for access token
        token_resp = http_requests.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": ser.validated_data["code"],
            },
            headers={"Accept": "application/json"},
            timeout=10,
        )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            return Response(
                {"detail": "GitHub token exchange failed."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        gh_headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        }

        # Fetch user profile
        user_resp = http_requests.get(
            "https://api.github.com/user", headers=gh_headers, timeout=10
        )
        if user_resp.status_code != 200:
            return Response(
                {"detail": "Failed to fetch GitHub user."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        gh_user = user_resp.json()

        # Fetch primary email (may be private)
        email = gh_user.get("email")
        if not email:
            emails_resp = http_requests.get(
                "https://api.github.com/user/emails",
                headers=gh_headers,
                timeout=10,
            )
            if emails_resp.status_code == 200:
                for entry in emails_resp.json():
                    if entry.get("primary") and entry.get("verified"):
                        email = entry["email"]
                        break

        if not email:
            return Response(
                {"detail": "No verified email found on GitHub account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = _user_for(email, gh_user.get("name") or gh_user.get("login") or "")
        return Response(_jwt_pair(user))
