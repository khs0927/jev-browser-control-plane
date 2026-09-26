from types import SimpleNamespace

import pytest

from jev_control_plane.router import JevRouter


class ChoiceStub:
    def __init__(self, instructions, criteria):
        self.instructions = instructions
        self.criteria = criteria


class NoulStub:
    def __init__(self, instructions, criteria=None):
        self.instructions = instructions
        self.criteria = criteria


class ScoreStub:
    def __init__(self, instructions, criteria):
        self.instructions = instructions
        self.criteria = criteria


class ClientStub:
    def __init__(self, answers, model='jev-test-1'):
        self._answers = answers
        self._model = model
        self.captured: dict = {}

    def system_one(self, **kwargs):
        self.captured.update(kwargs)
        return SimpleNamespace(model=self._model, answers=dict(self._answers))


def test_route_choice():
    answer = SimpleNamespace(
        choice='alpha', confidence=0.93, probabilities={'alpha': 0.93, 'beta': 0.07}
    )
    client = ClientStub({'route': answer})
    router = JevRouter(client=client, choice_type=ChoiceStub)
    result = router.choose(
        state={'value': 'sample'},
        instructions='Choose a class',
        candidates={'alpha': None, 'beta': None},
    )
    assert result.choice == 'alpha'
    assert result.confidence == 0.93
    assert result.probabilities == {'alpha': 0.93, 'beta': 0.07}
    assert result.model == 'jev-test-1'


def test_route_noul():
    answer = SimpleNamespace(noul=0.98)
    router = JevRouter(client=ClientStub({'is_urgent': answer}), noul_type=NoulStub)
    result = router.noul(
        state='결제 실패가 3일째 계속되고 있습니다.',
        instructions='이 메시지는 긴급함을 나타내는가?',
        question_name='is_urgent',
    )
    assert result.noul == 0.98
    assert result.model == 'jev-test-1'


def test_noul_without_criteria_omits_it():
    client = ClientStub({'q': SimpleNamespace(noul=0.1)})
    router = JevRouter(client=client, noul_type=NoulStub)
    router.noul(state='x', instructions='Is this true?', question_name='q')
    assert client.captured['questions']['q'].criteria is None


def test_noul_forwards_criteria():
    client = ClientStub({'q': SimpleNamespace(noul=0.1)})
    router = JevRouter(client=client, noul_type=NoulStub)
    router.noul(
        state='x',
        instructions='Is this true?',
        question_name='q',
        criteria={'true': 'the page loaded', 'false': 'an error was shown'},
    )
    assert client.captured['questions']['q'].criteria == {
        'true': 'the page loaded',
        'false': 'an error was shown',
    }


def test_noul_requires_instructions():
    router = JevRouter(client=ClientStub({}), noul_type=NoulStub)
    with pytest.raises(ValueError, match='instructions'):
        router.noul(state='x', instructions='   ', question_name='q')


def test_noul_rejects_empty_criteria():
    router = JevRouter(client=ClientStub({}), noul_type=NoulStub)
    with pytest.raises(ValueError, match='criteria'):
        router.noul(state='x', instructions='Is this true?', criteria={})


def test_route_score():
    answer = SimpleNamespace(
        score=2,
        confidence=0.81,
        legend={0: 'can wait', 1: 'this week', 2: 'today'},
        probabilities={0: 0.05, 1: 0.14, 2: 0.81},
    )
    router = JevRouter(client=ClientStub({'urgency': answer}), score_type=ScoreStub)
    result = router.score(
        state='A customer has not replied for a week.',
        instructions='How urgent is this ticket?',
        criteria=['can wait', 'this week', 'today'],
        question_name='urgency',
    )
    assert result.score == 2.0
    assert result.confidence == 0.81
    assert result.legend == {0: 'can wait', 1: 'this week', 2: 'today'}
    assert result.probabilities == {0: 0.05, 1: 0.14, 2: 0.81}
    assert result.model == 'jev-test-1'


def test_score_preserves_rubric_order():
    client = ClientStub({'s': SimpleNamespace(score=0, legend={}, probabilities={})})
    router = JevRouter(client=client, score_type=ScoreStub)
    router.score(
        state='x',
        instructions='How severe?',
        criteria=['minor', 'major'],
        question_name='s',
    )
    assert client.captured['questions']['s'].criteria == ['minor', 'major']


def test_score_is_not_rounded_to_an_integer():
    """The wire schema types `score` as a float, so a fractional value must survive."""
    answer = SimpleNamespace(
        score=1.5,
        confidence=0.6,
        legend={0: 'low', 1: 'mid', 2: 'high'},
        probabilities={0: 0.2, 1: 0.5, 2: 0.3},
    )
    router = JevRouter(client=ClientStub({'s': answer}), score_type=ScoreStub)
    result = router.score(
        state='x', instructions='How severe?', criteria=['low', 'mid', 'high'], question_name='s'
    )
    assert result.score == 1.5


def test_score_requires_instructions():
    router = JevRouter(client=ClientStub({}), score_type=ScoreStub)
    with pytest.raises(ValueError, match='instructions'):
        router.score(state='x', instructions=' ', criteria=['a', 'b'])


def test_score_rejects_empty_rubric():
    router = JevRouter(client=ClientStub({}), score_type=ScoreStub)
    with pytest.raises(ValueError, match='rubric'):
        router.score(state='x', instructions='How severe?', criteria=[])


def test_missing_answer_raises():
    router = JevRouter(client=ClientStub({}), noul_type=NoulStub)
    with pytest.raises(RuntimeError, match='did not contain answer'):
        router.noul(state='x', instructions='Is this true?', question_name='q')
