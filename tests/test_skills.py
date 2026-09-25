import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent


def _load_validator():
    """Load the validator by path; `scripts/` is a script directory, not a package."""
    path = REPO_ROOT / "scripts" / "validate_skills.py"
    spec = importlib.util.spec_from_file_location("validate_skills", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


validator = _load_validator()
validate_skill = validator.validate_skill
skill_root = validator.skill_root
STALE_REFERENCES = validator.STALE_REFERENCES
MIN_DESCRIPTION_LENGTH = validator.MIN_DESCRIPTION_LENGTH


def test_every_shipped_skill_is_valid():
    directories = sorted(p for p in skill_root(REPO_ROOT).iterdir() if p.is_dir())
    assert directories, "no skill directories found"
    for directory in directories:
        validate_skill(directory)


def test_validator_rejects_a_stale_product_reference(tmp_path):
    directory = tmp_path / 'browser-task'
    directory.mkdir()
    (directory / 'SKILL.md').write_text(
        '---\n'
        'name: browser-task\n'
        'description: A description that is comfortably longer than twenty characters.\n'
        '---\n'
        '# Browser task\n\n'
        'Use the official Aside Browser Agent and require confirmation.\n',
        encoding='utf-8',
    )
    with pytest.raises(ValueError, match='stale reference'):
        validate_skill(directory)


def test_validator_rejects_a_name_mismatch(tmp_path):
    directory = tmp_path / 'research'
    directory.mkdir()
    (directory / 'SKILL.md').write_text(
        '---\n'
        'name: something-else\n'
        'description: A description that is comfortably longer than twenty characters.\n'
        '---\n'
        '# Research\n\nAlways ask for confirmation.\n',
        encoding='utf-8',
    )
    with pytest.raises(ValueError, match='front matter name'):
        validate_skill(directory)


def test_validator_rejects_missing_confirmation_guidance(tmp_path):
    directory = tmp_path / 'shopping'
    directory.mkdir()
    (directory / 'SKILL.md').write_text(
        '---\n'
        'name: shopping\n'
        'description: A description that is comfortably longer than twenty characters.\n'
        '---\n'
        '# Shopping\n\nCompare prices.\n',
        encoding='utf-8',
    )
    with pytest.raises(ValueError, match='confirmation'):
        validate_skill(directory)


def test_validator_rejects_a_short_description(tmp_path):
    directory = tmp_path / 'jev-decision'
    directory.mkdir()
    (directory / 'SKILL.md').write_text(
        '---\n'
        'name: jev-decision\n'
        'description: too short\n'
        '---\n'
        '# Jev\n\nAsk for confirmation.\n',
        encoding='utf-8',
    )
    with pytest.raises(ValueError, match='description is too short'):
        validate_skill(directory)


def test_local_runtime_references_are_allowed_here():
    """The loopback bridge is legitimate in this repository.

    The source project forbade these because its target architecture was PC-free.
    That rule must not be carried over.
    """
    assert 'localhost' not in STALE_REFERENCES
    assert '127.0.0.1' not in STALE_REFERENCES
    assert MIN_DESCRIPTION_LENGTH == 20
