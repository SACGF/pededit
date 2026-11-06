#!/usr/bin/env python3
"""PostToolUse hook: after an edit under frontend/src/, remind the agent once
per file per session to run the page check (frontend/scripts/browser/).

Reads the hook payload on stdin and, when it applies, prints JSON with
additionalContext for the model. Never blocks and never fails the edit.
"""
import json
import os
import sys
import tempfile
from pathlib import Path

CODE_SUFFIXES = {".ts", ".tsx", ".css"}


def suggestion(rel: str) -> str:
    if rel.startswith("frontend/src/pages/LandingPage"):
        return "node frontend/scripts/browser/console.mjs /"
    if rel.startswith("frontend/src/pages/LoginPage"):
        return "node frontend/scripts/browser/console.mjs /login"
    return "node frontend/scripts/browser/console.mjs --fixture example:2"


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return
    tool_input = payload.get("tool_input") or {}
    file_path = tool_input.get("file_path") or tool_input.get("notebook_path")
    if not file_path:
        return
    project = Path(os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or ".").resolve()
    try:
        rel = Path(file_path).resolve().relative_to(project).as_posix()
    except ValueError:
        return
    if not rel.startswith("frontend/src/") or Path(rel).suffix not in CODE_SUFFIXES:
        return
    if "/__tests__/" in rel or ".test." in rel:
        return

    state_dir = Path(tempfile.gettempdir()) / "pededit-claude-hooks"
    state_dir.mkdir(exist_ok=True)
    state_file = state_dir / f"{payload.get('session_id', 'unknown')}.json"
    try:
        seen = set(json.loads(state_file.read_text()))
    except (OSError, ValueError):
        seen = set()
    if rel in seen:
        return
    seen.add(rel)
    state_file.write_text(json.dumps(sorted(seen)))

    message = (
        f"You edited {rel}. Before calling the change done, run it in the browser: "
        f"`{suggestion(rel)}` (add --click/--press steps that reach the changed code, "
        "or use shot.mjs and read the PNG). Start Vite first with "
        "`node frontend/scripts/browser/servers.mjs up --frontend-only` if it is not running. "
        "See frontend/scripts/browser/README.md. This reminder shows once per file per session."
    )
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": message}}))


if __name__ == "__main__":
    main()
