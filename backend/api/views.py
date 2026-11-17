from django.contrib.auth.models import User
from django.db.models import Q
from rest_framework import generics, permissions, status, viewsets
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.views import TokenRefreshView
from .models import Pedigree, TagPreset
from .throttling import AnonCreateBurstThrottle, AnonCreateSustainedThrottle
from .serializers import (
    UserSerializer,
    PedigreeSerializer,
    PedigreeListSerializer,
    TagPresetSerializer,
)


class MeView(generics.RetrieveDestroyAPIView):
    """
    GET    /api/auth/me/  -> the signed-in user
    DELETE /api/auth/me/  -> delete the account (#183)

    Deleting removes the User row, and with it (on_delete=CASCADE) every
    pedigree the user owns and their My library. Owned pedigrees are deleted,
    not made anonymous: their links never worked for anyone else, and turning
    them into links anyone could open would publish them. Anonymous pedigrees
    are not tied to any account, so they stay. Tokens already issued stop
    working because simplejwt looks the user up on every request and refresh.
    """

    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user

    def destroy(self, request, *args, **kwargs):
        user = request.user
        if user.is_staff or user.is_superuser:
            # An admin account holds the server's admin access; remove it in Django admin.
            return Response(
                {"detail": "An admin account cannot be deleted from the app."},
                status=status.HTTP_403_FORBIDDEN,
            )
        user.delete()  # one transaction with the cascade
        return Response(status=status.HTTP_204_NO_CONTENT)


class _RefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        # simplejwt 5.5 looks the user up with .get() and lets DoesNotExist
        # become a 500 when the account was deleted (#183). Answer 401, which
        # the frontend takes as signed out.
        try:
            return super().validate(attrs)
        except User.DoesNotExist:
            raise AuthenticationFailed("No active account found for the given token.", "no_active_account")


class RefreshView(TokenRefreshView):
    serializer_class = _RefreshSerializer


class PedigreeViewSet(viewsets.ModelViewSet):
    """
    list:           GET  /api/pedigrees/        → owned pedigrees (auth required)
    create:         POST /api/pedigrees/        → creates owned (auth) or anonymous (no auth)
    retrieve:       GET  /api/pedigrees/{id}/   → owned by user OR anonymous pedigree
    partial_update: PATCH /api/pedigrees/{id}/  → same access rules as retrieve
    destroy:        DELETE /api/pedigrees/{id}/ → same access rules as retrieve
    """

    # Only an anonymous create is counted (api/throttling.py).
    throttle_classes = [AnonCreateBurstThrottle, AnonCreateSustainedThrottle]

    def get_permissions(self):
        if self.action == "list":
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        user = self.request.user
        if self.action == "list":
            return Pedigree.objects.filter(owner=user)
        # retrieve / update / destroy: accessible = owned-by-user OR anonymous
        if user.is_authenticated:
            return Pedigree.objects.filter(Q(owner=user) | Q(owner=None))
        return Pedigree.objects.filter(owner=None)

    def get_serializer_class(self):
        if self.action == "list":
            return PedigreeListSerializer
        return PedigreeSerializer


class TagPresetViewSet(viewsets.ModelViewSet):
    """
    The signed-in user's personal tag library.

    list:    GET    /api/tag-presets/
    create:  POST   /api/tag-presets/
    update:  PATCH  /api/tag-presets/{id}/
    destroy: DELETE /api/tag-presets/{id}/
    """

    serializer_class = TagPresetSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return TagPreset.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)
