from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Pedigree, TagPreset


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
#
# Every field of the Pedigree interface in layout-engine/src/types.ts must be
# declared here. DRF drops undeclared keys from validated_data, so a missing
# field is silently lost on save.

class IndividualSerializer(serializers.Serializer):
    id = serializers.CharField()
    sex = serializers.ChoiceField(choices=["male", "female", "unknown"])
    affected = serializers.BooleanField()
    deceased = serializers.BooleanField(required=False, default=False)
    carrier = serializers.BooleanField(required=False, default=False)
    proband = serializers.BooleanField(required=False, default=False)
    sibOrder = serializers.IntegerField(required=False)
    name = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False)
    dob = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False)
    hpoTerms = serializers.ListField(child=serializers.CharField(), required=False)
    tags = serializers.ListField(child=serializers.CharField(), required=False)


class TagSerializer(serializers.Serializer):
    id = serializers.CharField()
    label = serializers.CharField(allow_blank=True, trim_whitespace=False)
    color = serializers.CharField()
    style = serializers.ChoiceField(choices=["quadrant", "dot", "text"])
    abbrev = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False)


class PartnershipSerializer(serializers.Serializer):
    id = serializers.CharField()
    individual1 = serializers.CharField()
    individual2 = serializers.CharField()
    consanguineous = serializers.BooleanField(required=False, default=False)


class SiblingOrderSettingsSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["insertion", "manual", "birthDate"])
    affectedFirst = serializers.BooleanField()


class CanvasSettingsSerializer(serializers.Serializer):
    nodesMoveable = serializers.BooleanField()
    snapToGrid = serializers.BooleanField()
    snapGridSize = serializers.FloatField(min_value=0)


class PositionSerializer(serializers.Serializer):
    x = serializers.FloatField()
    y = serializers.FloatField()


class PedigreeDataSerializer(serializers.Serializer):
    individuals = IndividualSerializer(many=True)
    partnerships = PartnershipSerializer(many=True)
    parentOf = serializers.DictField(
        child=serializers.ListField(child=serializers.CharField())
    )
    siblingOrder = SiblingOrderSettingsSerializer(required=False)
    pinnedPositions = serializers.DictField(child=PositionSerializer(), required=False)
    canvasSettings = CanvasSettingsSerializer(required=False)
    unlockedIndividuals = serializers.ListField(
        child=serializers.CharField(), required=False
    )
    tags = TagSerializer(many=True, required=False)


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


class TagPresetSerializer(serializers.ModelSerializer):
    class Meta:
        model = TagPreset
        fields = ["id", "label", "color", "style", "abbrev", "created"]
        read_only_fields = ["id", "created"]

    def validate_style(self, value):
        if value not in ("quadrant", "dot", "text"):
            raise serializers.ValidationError("style must be quadrant, dot or text")
        return value
