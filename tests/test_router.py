from types import SimpleNamespace

from jev_control_plane.router import JevRouter


class ChoiceStub:
    def __init__(self, instructions, criteria):
        self.instructions = instructions
        self.criteria = criteria


class ClientStub:
    def system_one(self, **kwargs):
        answer = SimpleNamespace(choice='alpha', confidence=0.93, probabilities={'alpha': 0.93, 'beta': 0.07})
        return SimpleNamespace(answers={'route': answer})


def test_route_choice():
    router = JevRouter(client=ClientStub(), choice_type=ChoiceStub)
    result = router.choose(state={'value': 'sample'}, instructions='Choose a class', candidates={'alpha': None, 'beta': None})
    assert result.choice == 'alpha'
    assert result.confidence == 0.93
