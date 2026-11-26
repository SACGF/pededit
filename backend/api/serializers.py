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


# Strings are kept exactly as sent and may be blank, as the schema allows;
# only the ids it gives minLength 1 (individual, partnership and tag ids) may
# not be blank.
def _text(**kwargs):
    return serializers.CharField(allow_blank=True, trim_whitespace=False, **kwargs)


def _opt_text():
    return _text(required=False, allow_null=True)


def _id():
    return serializers.CharField(trim_whitespace=False)


def _texts(**kwargs):
    return serializers.ListField(child=_text(), **kwargs)


def _opt_texts():
    return _texts(required=False, allow_null=True)


LIFE_STATUS_CHOICES = ["pregnancy", "miscarriage", "termination", "stillbirth", "ectopic"]


class EvaluationSerializer(serializers.Serializer):
    result = _opt(serializers.ChoiceField, choices=["positive", "negative", "uninformative"])
    detail = _opt_text()
    documented = _opt(serializers.BooleanField)


class IndividualSerializer(serializers.Serializer):
    id = _id()
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
    name = _opt_text()
    dob = _opt_text()
    dod = _opt_text()
    age = _opt_text()
    notes = _opt_text()
    hpoTerms = _opt_texts()
    lifeStatus = _opt(serializers.ChoiceField, choices=LIFE_STATUS_CHOICES)
    adopted = _opt(serializers.ChoiceField, choices=["in", "out"])
    reproductiveRole = _opt(serializers.ChoiceField, choices=["donor", "surrogate"])
    carriedBy = _opt_text()
    socialParents = _opt_texts()
    tags = _opt_texts()
    # Conditions (quadrant tags) carried (#115).
    carrierTags = _opt_texts()
    onset = _opt_text()
    tagOnset = _opt(serializers.DictField, child=_text())
    descendantsHidden = _opt(serializers.BooleanField)
    placeholder = _opt(serializers.BooleanField)


TAG_FILL_CHOICES = ["solid", "horizontal", "vertical", "diagonal", "crosshatch", "dots", "shade"]
TAG_KIND_CHOICES = ["condition", "trait"]


class TagSerializer(serializers.Serializer):
    id = _id()
    label = _text()
    color = _text()
    style = serializers.ChoiceField(choices=["quadrant", "dot", "text"])
    abbrev = _opt_text()
    fill = _opt(serializers.ChoiceField, choices=TAG_FILL_CHOICES)
    carrierFill = _opt(serializers.ChoiceField, choices=TAG_FILL_CHOICES)
    kind = _opt(serializers.ChoiceField, choices=TAG_KIND_CHOICES)


CHILDLESS_CHOICES = ["infertility", "byChoice"]
ZYGOSITY_CHOICES = ["monozygotic", "dizygotic", "unknown"]


class TwinSetSerializer(serializers.Serializer):
    members = _texts(min_length=2)
    zygosity = serializers.ChoiceField(choices=ZYGOSITY_CHOICES)


class PartnershipSerializer(serializers.Serializer):
    id = _id()
    individual1 = _text()
    individual2 = _text()
    consanguineous = _opt(serializers.BooleanField)
    consanguinityLabel = _opt_text()
    childless = _opt(serializers.ChoiceField, choices=CHILDLESS_CHOICES)
    childlessReason = _opt_text()
    twins = _opt(TwinSetSerializer, many=True)
    ended = _opt(serializers.BooleanField)
    donorConception = _opt(serializers.BooleanField)
    leftPartner = _opt_text()
    drawnBeside = _opt_text()


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
    showNotes = _opt(serializers.BooleanField)
    notesLength = _opt(serializers.ChoiceField, choices=["twoLines", "full"])
    symbolsShow = _opt(serializers.ChoiceField, choices=["gender", "sex"])
    notation = _opt(serializers.ChoiceField, choices=["nsgc2022", "nsgc2008"])
    tagFills = _opt(serializers.ChoiceField, choices=["color", "monochrome"])


class ClinicalDetailsSerializer(serializers.Serializer):
    referralReason = _opt_text()
    recordedBy = _opt_text()
    recordedOn = _opt_text()
    historian = _opt_text()
    maternalAncestry = _opt_text()
    paternalAncestry = _opt_text()


class ViewFiltersSerializer(serializers.Serializer):
    affectedOnly = _opt(serializers.BooleanField)
    affectedCondition = _opt_text()
    bloodRelativesOnly = _opt(serializers.BooleanField)
    side = _opt(serializers.ChoiceField, choices=["maternal", "paternal"])


class PositionSerializer(serializers.Serializer):
    x = serializers.FloatField()
    y = serializers.FloatField()


class PedigreeDataSerializer(serializers.Serializer):
    individuals = IndividualSerializer(many=True)
    partnerships = PartnershipSerializer(many=True)
    parentOf = serializers.DictField(child=_texts())
    siblingOrder = _opt(SiblingOrderSettingsSerializer)
    pinnedPositions = _opt(serializers.DictField, child=PositionSerializer())
    canvasSettings = _opt(CanvasSettingsSerializer)
    unlockedIndividuals = _opt_texts()
    tags = _opt(TagSerializer, many=True)
    chartTitle = _opt_text()
    clinicalDetails = _opt(ClinicalDetailsSerializer)
    filters = _opt(ViewFiltersSerializer)


def _same(raw, valid):
    """Whether DRF read `raw` as itself. A number is the same number whether
    it came as 1 or 1.0; a bool is never a number, though Python says 1 == True."""
    if isinstance(raw, bool) or isinstance(valid, bool):
        return type(raw) is type(valid) and raw == valid
    if isinstance(raw, (int, float)) and isinstance(valid, (int, float)):
        return raw == valid
    return type(raw) is type(valid) and raw == valid


def coerced_values(data, validated):
    """Where DRF accepted a value of the wrong type by converting it ("yes"
    as true, "1" as 1, 5 as "5", "" as null), as (path, steps, value read):
    the path written like structure_errors', the steps the keys and indexes
    that lead there. Walks the serializer's fields, so unknown fields are
    never visited."""
    found = []

    def walk(field, raw, valid, path, steps):
        if valid is None or not isinstance(raw, (dict, list)):
            if not _same(raw, valid):
                found.append((path, steps, valid))
        elif isinstance(field, serializers.Serializer):
            for name, sub in field.fields.items():
                if name in valid:
                    walk(sub, raw.get(name), valid[name], f"{path}.{name}" if path else name, steps + (name,))
        elif isinstance(field, (serializers.ListSerializer, serializers.ListField)):
            for i, (r, v) in enumerate(zip(raw, valid)):
                walk(field.child, r, v, f"{path}[{i}]", steps + (i,))
        elif isinstance(field, serializers.DictField):
            for key, v in valid.items():
                walk(field.child, raw.get(key), v, f'{path}["{key}"]', steps + (key,))

    walk(PedigreeDataSerializer(), data, validated, "", ())
    return found


def _type_name(value):
    if value is None:
        return "absent or null"
    if isinstance(value, bool):
        return "a boolean"
    if isinstance(value, (int, float)):
        return "a number"
    return "a string"


def _put(data, steps, value):
    for step in steps[:-1]:
        data = data[step]
    data[steps[-1]] = value


def structure_errors(data):
    """How the parts of a field-valid pedigree fail to fit together, as
    messages that start with the path. The same checks as the reference
    checks of the JSON importer (frontend/src/io/json/importer.ts): the
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
        for key in ("leftPartner", "drawnBeside"):
            if p.get(key) is not None and p[key] not in (a, b):
                errors.append(f"partnerships[{i}].{key}: {p[key]!r} is not a partner of partnership {pid!r}")
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
    submitted value (lossless: unknown keys kept, nothing added).

    DRF converts some values of the wrong type ("yes" to true, "1" to 1, 5 to
    "5") where the JSON importer refuses them. A pedigree with such a value,
    or whose parts do not fit together (structure_errors), is refused on
    create, where the caller is a script or an import and can fix its JSON.
    On update it is stored, with each converted value replaced by what DRF
    read so the stored JSON says what was validated: the editor auto-saves
    the whole pedigree, and refusing would turn one bad edit into every later
    edit being lost (#170).
    """

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("Expected a JSON object.")
        checker = PedigreeDataSerializer(data=data)
        if not checker.is_valid():
            raise serializers.ValidationError(checker.errors)
        # Round-trip through JSON so the stored value is plain JSON types and
        # does not alias the request body.
        stored = json.loads(json.dumps(data))
        coerced = coerced_values(stored, json.loads(json.dumps(checker.validated_data)))
        for _path, steps, value in coerced:
            _put(stored, steps, value)
        errors = structure_errors(stored)
        if getattr(self.parent, "instance", None) is None:
            errors = [f"{path}: must be {_type_name(value)}" for path, _steps, value in coerced] + errors
            if errors:
                raise serializers.ValidationError(errors)
        else:
            # No ids or messages: they are pedigree content.
            if coerced:
                logger.warning("Pedigree updated with %d values of the wrong type", len(coerced))
            if errors:
                logger.warning("Pedigree updated with %d structure errors", len(errors))
        return stored

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
    # Blank is the stored form of an absent Tag.fill, Tag.carrierFill or Tag.kind.
    fill = serializers.ChoiceField(choices=TAG_FILL_CHOICES, required=False, allow_blank=True)
    carrierFill = serializers.ChoiceField(
        source="carrier_fill", choices=TAG_FILL_CHOICES, required=False, allow_blank=True
    )
    kind = serializers.ChoiceField(choices=TAG_KIND_CHOICES, required=False, allow_blank=True)

    class Meta:
        model = TagPreset
        fields = ["id", "label", "color", "style", "abbrev", "fill", "carrierFill", "kind", "created"]
        read_only_fields = ["id", "created"]

    def validate_style(self, value):
        if value not in ("quadrant", "dot", "text"):
            raise serializers.ValidationError("style must be quadrant, dot or text")
        return value
