"""The running code's version: the git commit of the checkout, read once.

There is no release number; deployments are `git pull` of main (deploy.sh), so
the commit is what identifies a build. `.git` is read directly rather than via
a `git` subprocess so the health check works under systemd's ProtectSystem and
on a box without git on PATH. `PEDEDIT_VERSION` in the environment overrides
it, for builds that are not a git checkout.
"""

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def _read_git_commit(repo_root: Path) -> str | None:
    git_dir = repo_root / ".git"
    try:
        if git_dir.is_file():  # worktree: "gitdir: /path/to/.git/worktrees/x"
            git_dir = Path(git_dir.read_text().split(":", 1)[1].strip())
        head = (git_dir / "HEAD").read_text().strip()
        if not head.startswith("ref:"):
            return head or None
        ref = head[4:].strip()
        ref_file = git_dir / ref
        if ref_file.exists():
            return ref_file.read_text().strip() or None
        # A worktree's HEAD ref lives in the common dir; packed refs too.
        common = git_dir
        commondir = git_dir / "commondir"
        if commondir.exists():
            common = (git_dir / commondir.read_text().strip()).resolve()
        ref_file = common / ref
        if ref_file.exists():
            return ref_file.read_text().strip() or None
        packed = common / "packed-refs"
        if packed.exists():
            for line in packed.read_text().splitlines():
                if line.startswith("#") or line.startswith("^"):
                    continue
                parts = line.split()
                if len(parts) == 2 and parts[1] == ref:
                    return parts[0]
    except OSError:
        return None
    return None


def get_version() -> str:
    return os.environ.get("PEDEDIT_VERSION") or _read_git_commit(REPO_ROOT) or "unknown"


VERSION = get_version()
