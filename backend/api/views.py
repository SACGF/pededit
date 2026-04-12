from django.contrib.auth.models import User
from django.db.models import Q
from rest_framework import generics, permissions, viewsets
from rest_framework.response import Response
from .models import Pedigree
from .serializers import (
    RegisterSerializer,
    UserSerializer,
    PedigreeSerializer,
    PedigreeListSerializer,
)


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class PedigreeViewSet(viewsets.ModelViewSet):
    """
    list:           GET  /api/pedigrees/        → owned pedigrees (auth required)
    create:         POST /api/pedigrees/        → creates owned (auth) or anonymous (no auth)
    retrieve:       GET  /api/pedigrees/{id}/   → owned by user OR anonymous pedigree
    partial_update: PATCH /api/pedigrees/{id}/  → same access rules as retrieve
    destroy:        DELETE /api/pedigrees/{id}/ → same access rules as retrieve
    """

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
