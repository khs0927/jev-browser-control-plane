from jev_control_plane.verifier import require


def test_verifier_pass_and_fail():
    good = require(lambda state: state['value'] == 2, {'value': 2}, 'value is two')
    bad = require(lambda state: state['value'] == 2, {'value': 1}, 'value is two')
    assert good.ok is True
    assert bad.ok is False
