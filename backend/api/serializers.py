from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Pedigree


# ── Auth ─────────────────────────────────────────────────────────────────────

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]
        read_only_fields = ["id"]

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name"]


# ── Pedigree data shape (mirrors types.ts) ────────────────────────────────────

class IndividualSerializer(serializers.Serializer):
    id = serializers.CharField()
    sex = serializers.ChoiceField(choices=["male", "female", "unknown"])
    affected = serializers.BooleanField()
    deceased = serializers.BooleanField(required=False, default=False)
    carrier = serializers.BooleanField(required=False, default=False)
    proband = serializers.BooleanField(required=False, default=False)


class PartnershipSerializer(serializers.Serializer):
    id = serializers.CharField()
    individual1 = serializers.CharField()
    individual2 = serializers.CharField()
    consanguineous = serializers.BooleanField(required=False, default=False)


class PedigreeDataSerializer(serializers.Serializer):
    individuals = IndividualSerializer(many=True)
    partnerships = PartnershipSerializer(many=True)
    parentOf = serializers.DictField(
        child=serializers.ListField(child=serializers.CharField())
    )


# ── Pedigree model serializer ─────────────────────────────────────────────────

class PedigreeSerializer(serializers.ModelSerializer):
    data = PedigreeDataSerializer()

    class Meta:
        model = Pedigree
        fields = ["id", "title", "data", "created", "updated"]
        read_only_fields = ["id", "created", "updated"]

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["owner"] = request.user
        return super().create(validated_data)


class PedigreeListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list endpoint — omits data payload."""

    class Meta:
        model = Pedigree
        fields = ["id", "title", "created", "updated"]
