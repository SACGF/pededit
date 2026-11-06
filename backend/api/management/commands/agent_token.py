"""Mint a JWT pair for the claude_agent user, for agent-driven browser checks.

The browser harness in frontend/scripts/browser/ calls this for --as-agent and
seeds the tokens into localStorage, so a signed-in page check runs as a
dedicated account rather than as a real person. The account has no usable
password, so nobody can log in as it through the API.
"""
import json

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from rest_framework_simplejwt.tokens import RefreshToken

AGENT_USERNAME = "claude_agent"


class Command(BaseCommand):
    help = "Print a JSON {access, refresh} token pair for the passwordless claude_agent user."

    def handle(self, *args, **options):
        User = get_user_model()
        user, created = User.objects.get_or_create(
            username=AGENT_USERNAME,
            defaults={"first_name": "Claude", "last_name": "Agent"},
        )
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        elif user.has_usable_password() or user.is_staff or user.is_superuser:
            raise CommandError(
                f"user {AGENT_USERNAME!r} has a password or admin rights, so it is not an agent account; "
                "refusing to mint tokens for it"
            )
        refresh = RefreshToken.for_user(user)
        self.stdout.write(json.dumps({
            "username": user.username,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        }))
