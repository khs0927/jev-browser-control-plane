from jev_control_plane.browser_loop import action_table, run_browser_flow, ActionRule


class FakeBridge:
    def __init__(self):
        self.state = 0
        self.actions = []

    def call(self, name, arguments=None, *, scope=None, mutation_id=None):
        if name == "browser_snapshot":
            if self.state == 0:
                return '- button "Continue" [ref=e1]'
            return '- heading "Done" [ref=e2]'
        if name == "browser_click":
            self.actions.append((name, arguments, mutation_id))
            self.state = 1
            return {"ok": True}
        raise AssertionError(name)

    @staticmethod
    def mutation_id(goal, step, nonce=None):
        return f"mutation:{step}"


def chooser(**kwargs):
    ids = [row["id"] for row in kwargs["candidates"]]
    choice = "finish" if "finish" in ids else "action-0"
    candidate = next(row for row in kwargs["candidates"] if row["id"] == choice)
    return {
        "choice_id": choice,
        "confidence": 0.99,
        "candidate": candidate,
    }


def test_action_table_uses_current_ref_and_explicit_value():
    rows = action_table(
        '- textbox "Search" [ref=e9]',
        [ActionRule(action="fill", role="textbox", name="Search", value="Jev")],
    )
    assert rows == [
        {
            "id": "action-0",
            "description": 'fill textbox "Search" with the explicit supplied value',
            "tool": "browser_type",
            "arguments": {
                "element": 'textbox "Search"',
                "ref": "e9",
                "text": "Jev",
            },
        }
    ]


def evaluator(**kwargs):
    assert set(kwargs["questions"]) == {"completed", "risk"}
    return {
        "answers": {
            "completed": {"type": "noul", "noul": 0.99, "confidence": 0.99},
            "risk": {"type": "score", "score": 0.0, "confidence": 0.99},
        }
    }


def test_browser_flow_observes_decides_executes_and_reobserves():
    bridge = FakeBridge()
    result = run_browser_flow(
        bridge,
        chooser=chooser,
        evaluator=evaluator,
        goal="Continue until Done is visible",
        action_rules=[
            {"action": "click", "role": "button", "name": "Continue"}
        ],
        completion_text="Done",
        max_steps=4,
    )

    assert result["status"] == "verified"
    assert result["verified"] is True
    assert len(bridge.actions) == 1
    assert bridge.actions[0][1] == {
        "element": 'button "Continue"',
        "ref": "e1",
    }
    assert bridge.actions[0][2] == "mutation:1:action-0"


def test_browser_flow_stops_if_page_changes_after_decision():
    class StaleBridge(FakeBridge):
        def __init__(self):
            super().__init__()
            self.snapshots = 0

        def call(self, name, arguments=None, *, scope=None, mutation_id=None):
            if name == "browser_snapshot":
                self.snapshots += 1
                if self.snapshots == 1:
                    return '- button "Continue" [ref=e1]'
                return '- button "Changed" [ref=e7]'
            return super().call(
                name,
                arguments,
                scope=scope,
                mutation_id=mutation_id,
            )

    bridge = StaleBridge()
    result = run_browser_flow(
        bridge,
        chooser=chooser,
        goal="Continue",
        action_rules=[
            {"action": "click", "role": "button", "name": "Continue"}
        ],
        completion_text="Done",
    )

    assert result["status"] == "stale_observation"
    assert bridge.actions == []


def test_browser_flow_fails_closed_when_final_assessment_is_uncertain():
    bridge = FakeBridge()

    def uncertain(**kwargs):
        return {
            "answers": {
                "completed": {"type": "noul", "noul": 0.4, "confidence": 0.99},
                "risk": {"type": "score", "score": 0.0, "confidence": 0.99},
            }
        }

    result = run_browser_flow(
        bridge,
        chooser=chooser,
        evaluator=uncertain,
        goal="Continue until Done is visible",
        action_rules=[
            {"action": "click", "role": "button", "name": "Continue"}
        ],
        completion_text="Done",
        max_steps=4,
    )

    assert result["status"] == "assessment_uncertain"
    assert result["verified"] is False
    assert result["assessment"]["answers"]["completed"]["noul"] == 0.4
