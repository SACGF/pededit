import json
import logging

from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Pedigree, TagPreset


logger = logging.getLogger(__name__)


# ── Auth ─────────────────────────────────────────────────────────────────────

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


class EvaluationSerializer(serializers.Serializer):
    result = _opt(serializers.ChoiceField, choices=["positive", "negative", "uninformative"])
    detail = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    documented = _opt(serializers.BooleanField)


class IndividualSerializer(serializers.Serializer):
    id = serializers.CharField()
    sex = serializers.ChoiceField(choices=["male", "female", "unknown"])
    genderIdentity = _opt(serializers.ChoiceField, choices=["man", "woman", "nonbinary"])
    affected = serializers.BooleanField()
    deceased = _opt(serializers.BooleanField)
    carrier = _opt(serializers.BooleanField)
    presymptomatic = _opt(serializers.BooleanField)
    evaluations = _opt(serializers.ListField, child=EvaluationSerializer())
    proband = _opt(serializers.BooleanField)
    consultand = _opt(serializers.BooleanField)
    familyHistoryUnknown = _opt(serializers.BooleanField)
    sibOrder = serializers.FloatField(required=False)
    name = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    dob = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    dod = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    age = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    notes = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    hpoTerms = _opt(serializers.ListField, child=serializers.CharField())
    lifeStatus = _opt(serializers.ChoiceField, choices=LIFE_STATUS_CHOICES)
    adopted = _opt(serializers.ChoiceField, choices=["in", "out"])
    reproductiveRole = _opt(serializers.ChoiceField, choices=["donor", "surrogate"])
    carriedBy = _opt(serializers.CharField)
    socialParents = _opt(serializers.ListField, child=serializers.CharField())
    tags = _opt(serializers.ListField, child=serializers.CharField())
    # Conditions (quadrant tags) carried (#115).
    carrierTags = _opt(serializers.ListField, child=serializers.CharField())
    onset = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    tagOnset = _opt(
        serializers.DictField,
        child=serializers.CharField(allow_blank=True, trim_whitespace=False),
    )
    descendantsHidden = _opt(serializers.BooleanField)
    placeholder = _opt(serializers.BooleanField)


TAG_FILL_CHOICES = ["solid", "horizontal", "vertical", "diagonal", "crosshatch", "dots", "shade"]
TAG_KIND_CHOICES = ["condition", "trait"]


class TagSerializer(serializers.Serializer):
    id = serializers.CharField()
    label = serializers.CharField(allow_blank=True, trim_whitespace=False)
    color = serializers.CharField()
    style = serializers.ChoiceField(choices=["quadrant", "dot", "text"])
    abbrev = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    fill = _opt(serializers.ChoiceField, choices=TAG_FILL_CHOICES)
    kind = _opt(serializers.ChoiceField, choices=TAG_KIND_CHOICES)


CHILDLESS_CHOICES = ["infertility", "byChoice"]
ZYGOSITY_CHOICES = ["monozygotic", "dizygotic", "unknown"]


class TwinSetSerializer(serializers.Serializer):
    members = serializers.ListField(child=serializers.CharField(), min_length=2)
    zygosity = serializers.ChoiceField(choices=ZYGOSITY_CHOICES)


class PartnershipSerializer(serializers.Serializer):
    id = serializers.CharField()
    individual1 = serializers.CharField()
    individual2 = serializers.CharField()
    consanguineous = _opt(serializers.BooleanField)
    consanguinityLabel = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    childless = _opt(serializers.ChoiceField, choices=CHILDLESS_CHOICES)
    childlessReason = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    twins = _opt(TwinSetSerializer, many=True)
    ended = _opt(serializers.BooleanField)
    donorConception = _opt(serializers.BooleanField)
    leftPartner = _opt(serializers.CharField)
    drawnBeside = _opt(serializers.CharField)


class SiblingOrderSettingsSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["insertion", "manual", "birthDate"])
    affectedFirst = serializers.BooleanField()


class CanvasSettingsSerializer(serializers.Serializer):
    nodesMoveable = serializers.BooleanField()
    snapToGrid = serializers.BooleanField()
    snapGridSize = serializers.FloatField(min_value=0)
    nameLabels = _opt(serializers.ChoiceField, choices=["wrap", "truncate"])
    layoutWidth = _opt(serializers.ChoiceField, choices=["minimal", "relaxed"])
    showNumbers = _opt(serializers.BooleanField)
    relationshipLabels = _opt(serializers.BooleanField)
    showCoefficients = _opt(serializers.BooleanField)
    symbolsShow = _opt(serializers.ChoiceField, choices=["gender", "sex"])
    notation = _opt(serializers.ChoiceField, choices=["nsgc2022", "nsgc2008"])
    tagFills = _opt(serializers.ChoiceField, choices=["color", "monochrome"])


class ClinicalDetailsSerializer(serializers.Serializer):
    referralReason = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    recordedBy = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    recordedOn = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    historian = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    maternalAncestry = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    paternalAncestry = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)


class ViewFiltersSerializer(serializers.Serializer):
    affectedOnly = _opt(serializers.BooleanField)
    affectedCondition = _opt(serializers.CharField)
    bloodRelativesOnly = _opt(serializers.BooleanField)
    side = _opt(serializers.ChoiceField, choices=["maternal", "paternal"])


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
    chartTitle = _opt(serializers.CharField, allow_blank=True, trim_whitespace=False)
    clinicalDetails = _opt(ClinicalDetailsSerializer)
    filters = _opt(ViewFiltersSerializer)


def structure_errors(data):
    """How the parts of a field-valid pedigree fail to fit together, as
    messages that start with the path. The same checks, in the same order, as
    the errors of the JSON importer (frontend/src/io/json/importer.ts): the
    editor cannot lay out a pedigree that fails them. Keep the two in step.
    Ids are quoted with %r so error reporting scrubs them."""
    errors = []

    individual_ids = set()
    for i, ind in enumerate(data["individuals"]):
        if ind["id"] in individual_ids:
            errors.append(f"individuals[{i}]: duplicate individual id {ind['id']!r}")
        individual_ids.add(ind["id"])

    partners = {}
    partnership_ids = set()
    for i, p in enumerate(data["partnerships"]):
        pid, a, b = p["id"], p["individual1"], p["individual2"]
        if pid in partnership_ids:
            errors.append(f"partnerships[{i}]: duplicate partnership id {pid!r}")
        partnership_ids.add(pid)
        for key, member in (("individual1", a), ("individual2", b)):
            if member not in individual_ids:
                errors.append(f"partnerships[{i}].{key}: partnership {pid!r} refers to unknown individual {member!r}")
        if a == b:
            errors.append(f"partnerships[{i}]: partnership {pid!r} pairs individual {a!r} with itself")
        partners[pid] = (a, b)

    child_of = {}
    for pid, children in data["parentOf"].items():
        path = f'parentOf["{pid}"]'
        if pid not in partnership_ids:
            errors.append(f"{path}: parentOf key {pid!r} is not a partnership id")
        seen = set()
        for child in children:
            if child not in individual_ids:
                errors.append(f"{path}: child {child!r} of partnership {pid!r} does not exist")
                continue
            if child in seen:
                errors.append(f"{path}: child {child!r} is listed twice under partnership {pid!r}")
                continue
            seen.add(child)
            if child in partners.get(pid, ()):
                errors.append(f"{path}: individual {child!r} is a child of its own partnership {pid!r}")
            other = child_of.setdefault(child, pid)
            if other != pid:
                errors.append(f"{path}: individual {child!r} is a child of two partnerships ({other!r} and {pid!r})")

    tag_ids = set()
    for i, tag in enumerate(data.get("tags") or []):
        if tag["id"] in tag_ids:
            errors.append(f"tags[{i}]: duplicate tag id {tag['id']!r}")
        tag_ids.add(tag["id"])

    if not errors:
        cycle = _ancestry_cycle(child_of, partners)
        if cycle:
            errors.append("parentOf: circular ancestry: " + " -> ".join(repr(x) for x in cycle))
    return errors


def _ancestry_cycle(child_of, partners):
    """The first person found to be their own ancestor, as the chain of ids
    from them up to themselves, or []. Walks without recursion: the depth is
    whatever the caller sent."""
    done = set()
    for start in child_of:
        if start in done:
            continue
        path, on_path = [start], {start}
        stack = [iter(partners.get(child_of[start], ()))]
        while stack:
            parent = next(stack[-1], None)
            if parent is None:
                stack.pop()
                finished = path.pop()
                on_path.discard(finished)
                done.add(finished)
            elif parent in on_path:
                return path[path.index(parent):] + [parent]
            elif parent not in done:
                path.append(parent)
                on_path.add(parent)
                stack.append(iter(partners.get(child_of.get(parent), ())))
    return []


class PedigreeDataField(serializers.Field):
    """Validates pedigree JSON with PedigreeDataSerializer, then stores the
    submitted value untouched (lossless: unknown keys kept, nothing added).

    A pedigree whose parts do not fit together (structure_errors) is refused
    on create, where the caller is a script or an import and can fix its JSON.
    On update it is stored: the editor auto-saves the whole pedigree, and
    refusing would turn one bad edit into every later edit being lost (#170).
    """

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("Expected a JSON object.")
        checker = PedigreeDataSerializer(data=data)
        if not checker.is_valid():
            raise serializers.ValidationError(checker.errors)
        errors = structure_errors(data)
        if errors:
            if getattr(self.parent, "instance", None) is None:
                raise serializers.ValidationError(errors)
            # No ids or messages: they are pedigree content.
            logger.warning("Pedigree updated with %d structure errors", len(errors))
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
    # Blank is the stored form of an absent Tag.fill or Tag.kind.
    fill = serializers.ChoiceField(choices=TAG_FILL_CHOICES, required=False, allow_blank=True)
    kind = serializers.ChoiceField(choices=TAG_KIND_CHOICES, required=False, allow_blank=True)

    class Meta:
        model = TagPreset
        fields = ["id", "label", "color", "style", "abbrev", "fill", "kind", "created"]
        read_only_fields = ["id", "created"]

    def validate_style(self, value):
        if value not in ("quadrant", "dot", "text"):
            raise serializers.ValidationError("style must be quadrant, dot or text")
        return value
