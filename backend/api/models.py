import uuid
from django.db import models
from django.contrib.auth.models import User


class Pedigree(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="pedigrees",
        null=True,
        blank=True,
        default=None,
    )
    title = models.CharField(max_length=255, default="Untitled Pedigree")
    data = models.JSONField(
        default=dict,
        help_text=(
            "Serialised Pedigree: {individuals: Individual[], "
            "partnerships: Partnership[], parentOf: Record<string, string[]>}. "
            "Schema mirrors layout-engine/src/types.ts Pedigree interface."
        ),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated"]

    def __str__(self):
        owner_str = self.owner.username if self.owner_id else "anonymous"
        return f"{self.title} ({owner_str})"


class TagPreset(models.Model):
    """
    A tag definition saved to a user's personal library so it can be reused
    across pedigrees. The pedigree itself always carries its own copy of the
    tag (Pedigree.data.tags), so exports and sharing stay self-contained.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tag_presets")
    label = models.CharField(max_length=255)
    color = models.CharField(max_length=32)
    style = models.CharField(max_length=16)
    abbrev = models.CharField(max_length=64, blank=True, default="")
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["label"]

    def __str__(self):
        return f"{self.label} ({self.owner.username})"
