"""Focused contract checks for the reusable PDF tool (not website tests)."""
import copy
import json
import tempfile
from pathlib import Path

import pymupdf
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT

from inspect_pdf import inspect
from render import build, styles, validate
from check_fidelity import canonical


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def run():
    require(canonical("di mana") != canonical("dimana"), "Fidelity check erased word boundaries")
    require(canonical("dua\n kata") == canonical("dua kata"), "Fidelity check rejected line wrapping")
    s = styles()
    require(s["body"].alignment == TA_JUSTIFY, "Body text must be justified")
    require(s["list"].alignment == TA_JUSTIFY, "List text must be justified")
    require(s["heading"].alignment == TA_LEFT, "Headings must remain left-aligned")
    require(s["cell"].alignment == TA_LEFT, "Table cells must remain left-aligned")
    print("PASS fidelity preserves word boundaries, normalizes line wrapping, and enforces justified body styles")
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
    with tempfile.TemporaryDirectory(prefix="ptn-pro-pdf-check-") as scratch:
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
            {"type": "bullets", "marker": "•", "items": [
                "Wrapped list item that continues onto a second line so hanging indentation and horizontal text alignment can be verified against the bullet marker.",
                "Second list item immediately below with compact spacing."
            ]},
            {"type": "tip", "title": "💡 Veco Tips", "text": "Original wording stays selectable."},
            {"type": "references", "items": [{"label": "Official reference", "url": "https://ejaan.kemendikdasmen.go.id/"}]}
        ]}]
        lesson_file = scratch / "lesson.json"
        lesson_file.write_text(json.dumps(lesson))
        build(lesson, output)
        inspect(output, scratch / "inspection", lesson_file)
        pdf = pymupdf.open(output)
        require(len(pdf) == 1, "Unexpected page count")
        header_text = pdf[0].get_text(clip=pymupdf.Rect(0, 0, pdf[0].rect.width, 68))
        require("PTN PRO" in header_text and "VECALSS" not in header_text,
                "Header wordmark must read PTN PRO instead of VECALSS")
        body = pymupdf.Rect(0, 68, pdf[0].rect.width, pdf[0].rect.height - 54)
        image_rects = [rect for image in pdf[0].get_images() for rect in pdf[0].get_image_rects(image[0])]
        require(image_rects and all(not rect.intersects(body) for rect in image_rects),
                "Brand artwork is missing or an image entered the lesson body")
        spans = [span for block in pdf[0].get_text("dict")["blocks"]
                 for line in block.get("lines", []) for span in line["spans"]]
        bullet_span = next(s for s in spans if s["text"].strip() == "•")
        line1_span = next(s for s in spans if s["text"].startswith("Wrapped list item"))
        line2_span = next(s for s in spans if "bullet marker." in s["text"] and s is not line1_span)
        item2_span = next(s for s in spans if s["text"].startswith("Second list item"))
        require(line1_span["bbox"][0] > bullet_span["bbox"][2], "List text is not positioned in front of the bullet")
        require(abs(line1_span["bbox"][0] - line2_span["bbox"][0]) < 0.5, "Wrapped list line did not align with first line text")
        require(item2_span["bbox"][1] - line2_span["bbox"][1] < 20, "List item spacing is not compact")
        require(pdf[0].get_links(), "Reference is not clickable")
        require(len(pdf.get_toc()) == 1, "Single-page lesson has no bookmark")
        pdf.close()
        print("PASS PTN PRO header, mascot artwork, justified body, hanging list indentation, selectable text and clickable references")


if __name__ == "__main__":
    run()
