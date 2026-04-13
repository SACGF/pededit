from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RegisterView, MeView, PedigreeViewSet
from .social_auth import GoogleLoginView, GitHubLoginView

router = DefaultRouter()
router.register(r"pedigrees", PedigreeViewSet, basename="pedigree")

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("auth/google/", GoogleLoginView.as_view(), name="google-login"),
    path("auth/github/", GitHubLoginView.as_view(), name="github-login"),
    path("", include(router.urls)),
]
