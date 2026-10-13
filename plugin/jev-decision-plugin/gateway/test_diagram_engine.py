"""Pure-Python diagram engine smoke and security regressions (no network/secrets)."""
import unittest
from diagram_engine import render, validate_svg

class DiagramEnginePrivateTests(unittest.TestCase):
    def test_korean_flow_svg_valid(self):
        graph=render("건축규제 게이트웨이",[{"id":"site","label":"주소·필지"},{"id":"law","label":"법령·조례"}],[{"from":"site","to":"law"}],direction="TB")
        self.assertTrue(graph["svg"].startswith("<svg"))
        self.assertIn("건축규제",graph["svg"])
        self.assertTrue(validate_svg(graph["svg"])["valid"])
        self.assertEqual(graph["nodes"],2)
        self.assertEqual(graph["edges"],1)
        self.assertNotIn("<script", graph["html"])

    def test_html_escapes_user_input(self):
        result=render("<test & x>", [{"id":"a","label":"<script>alert(1)</script>"}],[])
        self.assertNotIn("<script>",result["svg"])
        self.assertIn("&lt;script&gt;",result["svg"])

    def test_size_guard(self):
        with self.assertRaises(ValueError):
            render("invalid", [{"id":f"n{i}","label":"n"} for i in range(25)], [])

    def test_bad_edges(self):
        with self.assertRaises(ValueError):
            render("bad",[{"id":"a","label":"A"}],[{"from":"a","to":"missing"}])

    def test_disallow_external_content(self):
        for dangerous in ['<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',
                          '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>']:
            self.assertFalse(validate_svg(dangerous)["valid"])

    def test_owner_oauth_not_embedded_in_engine(self):
        from pathlib import Path
        src=Path(__file__).with_name("diagram_engine.py").read_text(encoding="utf-8")
        self.assertNotIn("vercel.app",src)
        self.assertNotIn("Authorization:",src)
        self.assertNotIn("eval(",src)

if __name__=="__main__":
    unittest.main()
