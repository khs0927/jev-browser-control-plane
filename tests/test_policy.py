from jev_control_plane.policy import (
    DecisionPolicy,
    Disposition,
    disposition_for_noul,
)
from jev_control_plane.router import Decision, NoulDecision


def test_policy_thresholds():
    policy = DecisionPolicy(auto_confidence=0.88, planner_confidence=0.62)
    assert policy.disposition(Decision('x', 0.95, {})) is Disposition.EXECUTE
    assert policy.disposition(Decision('x', 0.70, {})) is Disposition.PLANNER
    assert policy.disposition(Decision('x', 0.30, {})) is Disposition.REOBSERVE


def test_policy_without_confidence_escalates():
    policy = DecisionPolicy()
    assert policy.disposition(Decision('x', None, {})) is Disposition.PLANNER


def test_noul_probability_uses_the_same_bands():
    policy = DecisionPolicy(auto_confidence=0.88, planner_confidence=0.62)
    assert disposition_for_noul(policy, 0.98) is Disposition.EXECUTE
    assert disposition_for_noul(policy, 0.70) is Disposition.PLANNER
    assert disposition_for_noul(policy, 0.30) is Disposition.REOBSERVE


def test_noul_result_cannot_be_passed_to_disposition():
    """A noul probability is not a confidence; the wrong call must not silently work."""
    policy = DecisionPolicy()
    noul_result = NoulDecision(noul=0.99, model='m')
    try:
        policy.disposition(noul_result)
    except AttributeError:
        return
    raise AssertionError('disposition() accepted a NoulDecision')
