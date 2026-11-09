import json

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
# These serializers only VALIDATE the known fields of the Pedigree interface in
# layout-engine/src/types.ts. They are never used to build what is stored:
# PedigreeDataField below saves the submitted JSON exactly as sent, so unknown
# fields (from a newer editor or another tool) survive, and no defaults are
# injected for absent optional fields. docs/pedigree-json-format.md promises
# this. Optional fields accept null, which the format treats as absent.

def _opt(field_cls, **kwargs):
    return field_cls(required=False, allow_null=True, **kwargs)


LIFE_STATUS_CHOICES = ["pregnancy", "miscarriage", "termination", "stillbirth", "ectopic"]


class IndividualSerializer(serializers.Serializer):
    id = serializers.CharField()
    sex = serializers.ChoiceField(choices=["male", "female", "unknown"])
    affected = serializers.BooleanField()
    deceased = _opt(serializers.BooleanField)
    carrier = _opt(serializers.BooleanField)
    proband = _opt(serializers.BooleanField)
    sibOrder = serializers.FloatField(required=False)
    name = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    dob = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    notes = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    hpoTerms = _opt(serializers.ListField, child=serializers.CharField())
    lifeStatus = _opt(serializers.ChoiceField, choices=LIFE_STATUS_CHOICES)
    tags = _opt(serializers.ListField, child=serializers.CharField())


class TagSerializer(serializers.Serializer):
    id = serializers.CharField()
    label = serializers.CharField(allow_blank=True, trim_whitespace=False)
    color = serializers.CharField()
    style = serializers.ChoiceField(choices=["quadrant", "dot", "text"])
    abbrev = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)


CHILDLESS_CHOICES = ["infertility", "byChoice"]


class PartnershipSerializer(serializers.Serializer):
    id = serializers.CharField()
    individual1 = serializers.CharField()
    individual2 = serializers.CharField()
    consanguineous = _opt(serializers.BooleanField)
    childless = _opt(serializers.ChoiceField, choices=CHILDLESS_CHOICES)
    childlessReason = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)


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
    siblingOrder = _opt(SiblingOrderSettingsSerializer)
    pinnedPositions = _opt(serializers.DictField, child=PositionSerializer())
    canvasSettings = _opt(CanvasSettingsSerializer)
    unlockedIndividuals = _opt(serializers.ListField, child=serializers.CharField())
    tags = _opt(TagSerializer, many=True)


class PedigreeDataField(serializers.Field):
    """Validates pedigree JSON with PedigreeDataSerializer, then stores the
    submitted value untouched (lossless: unknown keys kept, nothing added)."""

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("Expected a JSON object.")
        checker = PedigreeDataSerializer(data=data)
        if not checker.is_valid():
            raise serializers.ValidationError(checker.errors)
        # Round-trip through JSON so the stored value is plain JSON types and
        # does not alias the request body.
        return json.loads(json.dumps(data))

    def to_representation(self, value):
        return value


# ── Pedigree model serializer ─────────────────────────────────────────────────

class PedigreeSerializer(serializers.ModelSerializer):
    data = PedigreeDataField()

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
