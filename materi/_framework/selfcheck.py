"""Focused contract checks for the reusable PDF tool (not website tests)."""
import copy
import json
import tempfile
from pathlib import Path

import pymupdf

from inspect_pdf import inspect
from render import build, validate
from check_fidelity import canonical


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def run():
    require(canonical("di mana") != canonical("dimana"), "Fidelity check erased word boundaries")
    require(canonical("dua\n kata") == canonical("dua kata"), "Fidelity check rejected line wrapping")
    print("PASS fidelity preserves word boundaries and normalizes line wrapping")
    base = json.loads((Path(__file__).parent / "examples/pbm1.lesson.json").read_text())
    cases = []
    broken = copy.deepcopy(base)
    broken["pages"][1]["id"] = broken["pages"][0]["id"]
    cases.append(("duplicate IDs", broken))
    broken = copy.deepcopy(base)
    broken["pages"][0]["blocks"] = [{"type": "source-pdf-background", "path": "source.pdf"}]
    cases.append(("source-page import block", broken))
    broken = copy.deepcopy(base)
    broken["pages"][0]["blocks"] = [{"type": "table", "headers": ["A", "B"], "rows": [["A"]]}]
    cases.append(("ragged table", broken))
    broken = copy.deepcopy(base)
    broken["pages"][0]["blocks"] = [{"type": "question", "id": "1", "prompt": "Choose", "options": ["**key**"]*5}]
    broken["verbatim"] = False
    cases.append(("answer typography leakage", broken))
    for label, lesson in cases:
        try:
            validate(lesson)
        except (ValueError, AssertionError):
            print(f"PASS rejected {label}")
        else:
            raise AssertionError(f"Accepted invalid input: {label}")
    with tempfile.TemporaryDirectory(prefix="vecalss-pdf-check-") as scratch:
        scratch = Path(scratch)
        output = scratch / "existing.pdf"
        output.write_bytes(b"prior artifact")
        broken = copy.deepcopy(base)
        broken["pages"] = broken["pages"][:1]
        broken["pages"][0]["blocks"] = [{"type": "paragraph", "text": "An explanation. " * 3000}]
        try:
            build(broken, output)
        except Exception as error:
            require("overflow" in str(error).lower() or "too large" in str(error).lower(), str(error))
            require(output.read_bytes() == b"prior artifact", "Failed build replaced prior artifact")
            require(not output.with_name(f".{output.name}.tmp").exists(), "Failed build left temp output")
            print("PASS overflow rejected and prior artifact preserved")
        else:
            raise AssertionError("Accepted an overflowing page")
        lesson = copy.deepcopy(base)
        lesson["pages"] = [{"id": "roundtrip", "title": "Round-trip check", "source_pages": [1], "blocks": [
            {"type": "paragraph", "text": "First line.\nSecond line with **bold** and *italic*. Symbols → ↔ ≠ ≥ • ● and 🦆 💡 ⚠."},
            {"type": "references", "items": [{"label": "Official reference", "url": "https://ejaan.kemendikdasmen.go.id/"}]}
        ]}]
        lesson_file = scratch / "lesson.json"
        lesson_file.write_text(json.dumps(lesson))
        build(lesson, output)
        inspect(output, scratch / "inspection", lesson_file)
        pdf = pymupdf.open(output)
        require(len(pdf) == 1 and not pdf[0].get_images(), "Text-only build imported a page image")
        require(pdf[0].get_links(), "Reference is not clickable")
        require(len(pdf.get_toc()) == 1, "Single-page lesson has no bookmark")
        pdf.close()
        print("PASS line breaks, embedded emphasis, selectable text and clickable references")


if __name__ == "__main__":
    run()
