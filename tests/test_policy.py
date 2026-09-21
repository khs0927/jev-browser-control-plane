from jev_control_plane.policy import DecisionPolicy, Disposition
from jev_control_plane.router import Decision


def test_policy_thresholds():
    policy = DecisionPolicy(auto_confidence=0.88, planner_confidence=0.62)
    assert policy.disposition(Decision('x', 0.95, {})) is Disposition.EXECUTE
    assert policy.disposition(Decision('x', 0.70, {})) is Disposition.PLANNER
    assert policy.disposition(Decision('x', 0.30, {})) is Disposition.REOBSERVE
