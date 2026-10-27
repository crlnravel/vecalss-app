"""Require original PDF text, editable lesson, and designed PDF body to agree."""
import argparse
import json
import re
from pathlib import Path

import pymupdf


def canonical(text):
    # Ignore only layout whitespace, extraction zero-width spaces and emoji
    # presentation selectors. Words, case, punctuation, numbers and order stay exact.
    return re.sub(r"[\s\u200b\ufeff\ufe0f]", "", text)


def authored_text(lesson):
    text = []
    for page in lesson["pages"]:
        text.append(page["title"])
        for block in page["blocks"]:
            kind = block["type"]
            if kind in ("paragraph", "heading"):
                text.append(block["text"])
            elif kind == "table":
                text.extend(block["headers"])
                text.extend(v for row in block["rows"] for v in row)
            elif kind == "bullets":
                text.extend(block.get("marker", "•") + i for i in block["items"])
            elif kind == "steps":
                text.extend(f"{n}." + i for n, i in enumerate(block["items"], block.get("start", 1)))
            elif kind == "question":
                text.append(block["id"] + "." + block["prompt"])
                text.extend(label + "." + i for label, i in zip(block.get("labels", "ABCDE"), block["options"]))
            else:
                raise ValueError(f"Verbatim fidelity needs an explicit text contract for {kind}")
    return re.sub(r"\*\*|\*", "", "\n".join(text))


def require_equal(expected, actual, label, report):
    a, b = canonical(expected), canonical(actual)
    if a != b:
        first = next((i for i, (x, y) in enumerate(zip(a, b)) if x != y), min(len(a), len(b)))
        report[label] = {"passed": False, "first_mismatch": first,
                         "expected": a[max(0, first-60):first+140],
                         "actual": b[max(0, first-60):first+140]}
        raise ValueError(f"{label}: {json.dumps(report[label], ensure_ascii=False)}")
    report[label] = {"passed": True, "non_whitespace_characters": len(a)}


def check(source_path, lesson_path, output_path, report_path):
    report = {"source": str(source_path), "output": str(output_path)}
    try:
        source = pymupdf.open(source_path)
        expected = "\n".join(page.get_text() for page in source)
        source.close()
        lesson = json.loads(lesson_path.read_text())
        require_equal(expected, authored_text(lesson), "source_to_editable_lesson", report)
        output = pymupdf.open(output_path)
        body = "\n".join(page.get_text(clip=pymupdf.Rect(0, 68, page.rect.width, page.rect.height-54)) for page in output)
        report["output_pages"] = len(output)
        output.close()
        require_equal(expected, body, "source_to_rendered_body", report)
    finally:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("lesson", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("report", type=Path)
    args = parser.parse_args()
    check(args.source, args.lesson, args.output, args.report)
