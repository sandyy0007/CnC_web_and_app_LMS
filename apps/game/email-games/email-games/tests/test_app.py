import unittest
import json
from pathlib import Path

from backend.scoring import eedi_payload, writing_score


class ScoringTests(unittest.TestCase):
    def test_complete_email_passes(self):
        text = "Please send the research notes tomorrow at 10 AM so our team can finish. Thank you for your help with this project."
        self.assertGreaterEqual(writing_score(text, ["research", "tomorrow", "10", "please"], 20), 65)

    def test_empty_email_fails(self):
        self.assertLess(writing_score("", ["apology"], 20), 65)

    def test_eedi_envelope(self):
        data = {"game_id":"rescue","score":800,"duration_seconds":90,"accuracy":100,"satisfaction":90,"hints_used":1,"attempts_used":0}
        self.assertEqual(eedi_payload(data)["event"], "email_game.completed")

    def test_games_are_interactive_and_not_multiple_choice(self):
        data = json.loads((Path(__file__).parents[1] / "data" / "scenarios.json").read_text())
        mechanics = {challenge["mechanic"] for game in data.values() for mission in game["missions"] for challenge in mission["challenges"]}
        self.assertEqual(mechanics, {"scanner", "forge", "evidence", "order", "calendar", "compose"})
        self.assertFalse(any("options" in challenge for game in data.values() for mission in game["missions"] for challenge in mission["challenges"]))
        self.assertEqual(len(data["rescue"]["missions"][0]["challenges"]), 15)
        self.assertFalse(any(challenge["mechanic"] == "dials" for challenge in data["rescue"]["missions"][0]["challenges"]))

    def test_progress_schema_enforces_per_player_game_state(self):
        schema = (Path(__file__).parents[1] / "sql" / "schema.sql").read_text()
        self.assertIn("CREATE TABLE IF NOT EXISTS player_progress", schema)
        self.assertIn("PRIMARY KEY (player_id, game_id)", schema)

    def test_chapters_publish_time_and_score_expectations(self):
        app = (Path(__file__).parents[1] / "frontend" / "app.js").read_text()
        self.assertIn("estimate:3+Math.floor(i/4)", app)
        self.assertIn("up to 100 points", app)
        self.assertIn("finalPace", app)

    def test_escape_room_has_four_distinct_event_types(self):
        data = json.loads((Path(__file__).parents[1] / "data" / "scenarios.json").read_text())
        mechanics = {challenge["mechanic"] for mission in data["escape"]["missions"] for challenge in mission["challenges"]}
        self.assertEqual(mechanics, {"evidence", "order", "calendar", "compose"})
        app = (Path(__file__).parents[1] / "frontend" / "app.js").read_text()
        self.assertIn("['evidence','order','calendar','compose']", app)

    def test_progression_increases_pressure_and_rotates_hints(self):
        app = (Path(__file__).parents[1] / "frontend" / "app.js").read_text()
        self.assertIn("Math.max(2,5-difficulty)", app)
        self.assertIn("Math.max(1,4-Math.ceil(difficulty/2))", app)
        self.assertIn("const hintVariants", app)
        self.assertIn("state.levelNumber-1+state.step", app)


if __name__ == "__main__":
    unittest.main()
