"""Print usage over the last N days (default 7), for deploy.sh and ad hoc checks (#78).

Anonymous users have no identity on the server (the pedigree UUID is the only
key), so they are counted through their pedigrees. Signed-in activity is the
distinct owners of pedigrees created or edited in the window: social login
issues JWTs without touching User.last_login, so last_login means nothing here.
The claude_agent account used by the browser checks is left out.
"""
import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import F
from django.utils import timezone

from api.management.commands.agent_token import AGENT_USERNAME
from api.models import Pedigree


def usage_stats(days: int = 7) -> dict:
    User = get_user_model()
    since = timezone.now() - timedelta(days=days)
    users = User.objects.exclude(username=AGENT_USERNAME)
    pedigrees = Pedigree.objects.exclude(owner__username=AGENT_USERNAME)
    owned = pedigrees.filter(owner__isnull=False)
    anon = pedigrees.filter(owner__isnull=True)

    def counts(qs):
        created = qs.filter(created__gte=since)
        # Edited in the window but created before it, so a new pedigree is not
        # counted twice. auto_now sets updated a moment after created, so
        # "updated > created" cannot tell an edit from a fresh row.
        edited = qs.filter(updated__gte=since, created__lt=since)
        return {"total": qs.count(), "created": created.count(), "edited": edited.count()}

    active_owners = (
        owned.filter(updated__gte=since).values("owner").distinct().count()
    )
    return {
        "days": days,
        "users": {
            "total": users.count(),
            "new": users.filter(date_joined__gte=since).count(),
            "active": active_owners,
        },
        "pedigrees": {
            "signed_in": counts(owned),
            "anonymous": counts(anon),
        },
    }


class Command(BaseCommand):
    help = "Print signed-in users and signed-in vs anonymous pedigrees created and edited over the last N days."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=7)
        parser.add_argument("--json", action="store_true", dest="as_json", help="Print JSON instead of text.")

    def handle(self, *args, days, as_json, **options):
        s = usage_stats(days)
        if as_json:
            self.stdout.write(json.dumps(s))
            return
        u, p = s["users"], s["pedigrees"]
        w = f"last {days} days"
        lines = [
            f"Usage, {w}:",
            f"  {'signed-in users':<20} {u['total']:>6} total, {u['new']} new, {u['active']} active (created or edited a pedigree)",
        ]
        for label, key in (("signed-in", "signed_in"), ("anonymous", "anonymous")):
            c = p[key]
            lines.append(
                f"  {label + ' pedigrees':<20} {c['total']:>6} total, {c['created']} created, {c['edited']} older ones edited"
            )
        self.stdout.write("\n".join(lines))

