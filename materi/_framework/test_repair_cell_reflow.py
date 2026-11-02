"""Regression checks for the reviewed cross-page PBM05 cell reconstruction."""
import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import repair_material_set as repair


class CellReflowTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "source-order.txt"
        self.mapping = copy.deepcopy(repair.PBM05_CELL_REFLOW)
        self.fragments = self.mapping["fragments"]
        self.pages = {
            9: "untouched preceding page",
            10: "prior row " + " ".join(f["text"] for f in self.fragments[:3]),
            11: " ".join(f["text"] for f in self.fragments[3:]) + " following section",
            12: "untouched following page",
        }

    def run_mapping(self):
        self.path.write_text("\n".join(
            f"[[SOURCE PAGE {number:03d}]]\n{text}" for number, text in self.pages.items()
        ), encoding="utf-8")
        self.mapping["transcript_sha256"] = repair.sha256(self.path)
        with patch.object(repair, "PBM05_CELL_REFLOW", self.mapping):
            return repair.reflow_source_cells(
                {"code": "PBM", "index": 5}, self.pages, self.path,
                self.mapping["source_sha256"],
            )

    def test_reconstructs_cells_and_preserves_surroundings(self):
        before = copy.deepcopy(self.pages)
        actual, audit = self.run_mapping()
        logical = " ".join(self.fragments[i]["text"] for i in [0, 1, 3, 2, 4])
        self.assertEqual(actual, "untouched preceding page prior row " + logical
                         + " following section untouched following page")
        self.assertEqual(self.pages, before)
        self.assertEqual(len(audit[0]["located_fragments"]), 5)

    def test_duplicate_fragment_rejected(self):
        self.pages[10] += " " + self.fragments[0]["text"]
        with self.assertRaisesRegex(ValueError, "exactly once"):
            self.run_mapping()

    def test_missing_fragment_rejected(self):
        self.pages[11] = self.pages[11].replace(self.fragments[3]["text"], "")
        with self.assertRaisesRegex(ValueError, "exactly once"):
            self.run_mapping()

    def test_interleaved_text_rejected(self):
        self.pages[11] = self.pages[11].replace(
            self.fragments[4]["text"], "unclaimed text " + self.fragments[4]["text"]
        )
        with self.assertRaisesRegex(ValueError, "interleaves"):
            self.run_mapping()

    def test_changed_transcript_pin_rejected(self):
        self.path.write_text("changed", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "reviewed source/transcript bytes"):
            repair.reflow_source_cells({"code": "PBM", "index": 5}, self.pages,
                                      self.path, self.mapping["source_sha256"])

    def test_incomplete_permutation_rejected(self):
        self.mapping["logical_order"] = [0, 1, 3, 2, 2]
        with self.assertRaisesRegex(ValueError, "every fragment"):
            self.run_mapping()

    def test_other_lessons_keep_page_order(self):
        result, audit = repair.reflow_source_cells(
            {"code": "PBM", "index": 6}, {1: "a\nb", 2: "c d"}, self.path, "unused"
        )
        self.assertEqual(result, "a b c d")
        self.assertEqual(audit, [])


class LayoutRegressionTests(unittest.TestCase):
    def test_paragraph_style_spacing_counts_toward_page_budget(self):
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.platypus import Paragraph
        paragraph = Paragraph("One line", ParagraphStyle(
            "spacing-regression", fontName="Helvetica", fontSize=10, leading=12,
            spaceBefore=7, spaceAfter=11,
        ))
        self.assertEqual(repair._flowable_height(paragraph, 200, 700), 30)

    def test_bold_italic_keyword_and_italic_explanation_render_without_markers(self):
        text = repair.render.rich("***Tetapi*** *biasanya berada di dalam kalimat.*")
        self.assertEqual(text, "<b><i>Tetapi</i></b> <i>biasanya berada di dalam kalimat.</i>")

    def test_italic_explanation_and_bold_italic_ending_render_without_markers(self):
        text = repair.render.rich("*pertimbangkan* ***konjungsi antarkalimat.***")
        self.assertEqual(text, "<i>pertimbangkan</i> <b><i>konjungsi antarkalimat.</i></b>")


if __name__ == "__main__":
    unittest.main()
