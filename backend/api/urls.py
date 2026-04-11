from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RegisterView, MeView, PedigreeViewSet

router = DefaultRouter()
router.register(r"pedigrees", PedigreeViewSet, basename="pedigree")

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("", include(router.urls)),
]
