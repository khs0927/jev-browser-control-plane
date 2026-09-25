"""Validate the skill directory.

Adapted from the ASIDE-GPT `scripts/validate-skills.ts` check. The structural
rules are unchanged. The forbidden-token rule is deliberately inverted: ASIDE-GPT
forbade local-runtime references because its target architecture was PC-free,
while this control plane legitimately talks to a loopback bridge. What must never
reappear here is the vocabulary of the project these skills were ported from.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Structural rules carried over from the original validator.
MIN_DESCRIPTION_LENGTH = 20
CONFIRMATION_MARKERS = ("confirmation", "confirm")

# Product vocabulary that must not leak into this repository's skills.
STALE_REFERENCES = (
    "Aside",
    "aside-remote",
    "official-aside-access-required",
    "ASIDE-GPT",
    "aside-gpt",
    "Work's native cloud browser",
    "Work’s native cloud browser",
)


def skill_root(repo_root: Path) -> Path:
    return repo_root / "skills"


def parse_front_matter(source: str, path: Path) -> tuple[dict[str, str], str]:
    if not source.startswith("---\n"):
        raise ValueError(f"{path}: missing YAML front matter")

    end = source.find("\n---\n", 4)
    if end < 0:
        raise ValueError(f"{path}: unterminated YAML front matter")

    metadata: dict[str, str] = {}
    for line in source[4:end].split("\n"):
        key, separator, value = line.partition(":")
        if separator:
            metadata[key.strip()] = value.strip()

    return metadata, source[end + 5 :]


def validate_skill(directory: Path) -> None:
    path = directory / "SKILL.md"
    source = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    metadata, body = parse_front_matter(source, path)

    if metadata.get("name") != directory.name:
        raise ValueError(f"{path}: front matter name must be {directory.name}")

    description = metadata.get("description", "")
    if len(description) < MIN_DESCRIPTION_LENGTH:
        raise ValueError(f"{path}: description is too short")

    for stale in STALE_REFERENCES:
        if stale in body:
            raise ValueError(
                f"{path}: stale reference to {stale!r} from the ported source project"
            )

    if not any(marker in body.lower() for marker in CONFIRMATION_MARKERS):
        raise ValueError(f"{path}: missing confirmation guidance")


def main() -> int:
    root = skill_root(Path(__file__).resolve().parent.parent)
    entries = sorted(p for p in root.iterdir() if p.is_dir())
    if not entries:
        print(f"No skill directories found under {root}", file=sys.stderr)
        return 1

    for entry in entries:
        try:
            validate_skill(entry)
        except ValueError as error:
            print(error, file=sys.stderr)
            return 1

    print(f"Validated {len(entries)} skill(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
