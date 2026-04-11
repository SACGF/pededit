from django.contrib.auth.models import User
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
    list:   GET  /api/pedigrees/          → PedigreeListSerializer (no data field)
    create: POST /api/pedigrees/          → PedigreeSerializer
    retrieve: GET /api/pedigrees/{id}/   → PedigreeSerializer
    partial_update: PATCH /api/pedigrees/{id}/
    destroy: DELETE /api/pedigrees/{id}/
    """
    serializer_class = PedigreeSerializer

    def get_queryset(self):
        return Pedigree.objects.filter(owner=self.request.user)

    def get_serializer_class(self):
        if self.action == "list":
            return PedigreeListSerializer
        return PedigreeSerializer
