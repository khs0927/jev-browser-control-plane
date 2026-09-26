import dataclasses

import pytest

from jev_control_plane.checkpoint import (
    CHECKPOINT_KIND,
    BrowserSource,
    JevDecisionCheckpoint,
    assert_resume_allowed,
    create_checkpoint,
)
from jev_control_plane.router import Decision, NoulDecision, ScoreDecision


def test_checkpoint_never_authorizes_the_browser_action():
    decision = NoulDecision(noul=0.99, model='jev-test-1')
    checkpoint = create_checkpoint(
        purpose='decide whether the cart needs review',
        decision=decision,
        next_browser_action='click the checkout button',
    )
    assert checkpoint.browser_action_authorized is False
    assert checkpoint.requires_fresh_snapshot is True
    assert checkpoint.kind == CHECKPOINT_KIND
    assert checkpoint.model == 'jev-test-1'


def test_safety_flags_cannot_be_set_at_construction():
    fields = {field.name: field for field in dataclasses.fields(JevDecisionCheckpoint)}
    assert fields['browser_action_authorized'].init is False
    assert fields['requires_fresh_snapshot'].init is False

    decision = Decision(choice='alpha', confidence=0.9, probabilities={}, model='m')
    with pytest.raises(TypeError):
        create_checkpoint(
            purpose='p',
            decision=decision,
            next_browser_action='a',
            browser_action_authorized=True,
        )


def test_checkpoint_is_immutable():
    decision = NoulDecision(noul=0.5, model='m')
    checkpoint = create_checkpoint(
        purpose='p', decision=decision, next_browser_action='a'
    )
    with pytest.raises(dataclasses.FrozenInstanceError):
        checkpoint.purpose = 'changed'


def test_checkpoint_records_browser_source():
    decision = ScoreDecision(
        score=1,
        confidence=0.7,
        legend={0: 'low', 1: 'high'},
        probabilities={0: 0.3, 1: 0.7},
        model='jev-test-1',
    )
    checkpoint = create_checkpoint(
        purpose='rank the open tickets',
        decision=decision,
        next_browser_action='open the top ticket',
        source=BrowserSource(
            tab_id='tab-7', url='https://example.test/queue', page_title='Queue'
        ),
        observed_at='2026-09-26T00:00:00+00:00',
    )
    assert checkpoint.source.tab_id == 'tab-7'
    assert checkpoint.observed_at == '2026-09-26T00:00:00+00:00'
    assert checkpoint.decision.score == 1


def test_checkpoint_requires_purpose_and_next_action():
    decision = NoulDecision(noul=0.5, model='m')
    with pytest.raises(ValueError, match='purpose'):
        create_checkpoint(purpose='  ', decision=decision, next_browser_action='a')
    with pytest.raises(ValueError, match='next browser action'):
        create_checkpoint(purpose='p', decision=decision, next_browser_action='  ')


def test_resume_requires_a_fresh_snapshot():
    decision = NoulDecision(noul=0.9, model='m')
    checkpoint = create_checkpoint(
        purpose='p', decision=decision, next_browser_action='click submit'
    )
    with pytest.raises(PermissionError, match='fresh browser snapshot'):
        assert_resume_allowed(checkpoint, fresh_snapshot_taken=False)
    assert_resume_allowed(checkpoint, fresh_snapshot_taken=True)
