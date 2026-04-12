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
