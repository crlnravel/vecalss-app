"""Require original PDF text, editable lesson, and designed PDF body to agree."""
import argparse
import json
import re
from pathlib import Path

import pymupdf


def canonical(text):
    # Collapse layout whitespace without deleting word boundaries: di mana must
    # never compare equal to dimana. Remove only nonsemantic extraction controls.
    text = re.sub(r"[\u200b\ufeff\ufe0f]", "", text)
    return " ".join(text.split())


def authored_text(lesson):
    text = []
    for page in lesson["pages"]:
        text.append(page["title"])
        for block in page["blocks"]:
            kind = block["type"]
            if kind in ("paragraph", "heading", "title"):
                text.append(block["text"])
            elif kind == "note":
                text.append(block["title"])
                text.append(block["text"])
            elif kind == "tip":
                text.append(block["title"])
                if "content" in block:
                    for part in block["content"]:
                        if part["type"] == "paragraph":
                            text.append(part["text"])
                        elif part["type"] == "bullets":
                            marker = part.get("marker", "•")
                            text.extend(marker + " " + item for item in part["items"])
                        else:
                            raise ValueError(f"Unknown tip content block: {part['type']}")
                else:
                    if "text" in block:
                        text.append(block["text"])
                    if "items" in block:
                        marker = block.get("marker", "•")
                        text.extend(marker + " " + i for i in block["items"])
            elif kind == "table":
                if not block.get("synthetic_header"):
                    text.extend(block["headers"])
                text.extend(v for row in block["rows"] for v in row)
            elif kind == "bullets":
                text.extend(block.get("marker", "•") + " " + i for i in block["items"])
            elif kind == "steps":
                labels = block.get("item_labels")
                if labels is None:
                    labels = [f"{n}." for n in range(
                        block.get("start", 1), block.get("start", 1) + len(block["items"])
                    )]
                if len(labels) != len(block["items"]):
                    raise ValueError("Numbered-step labels must match the number of items")
                text.extend(label + " " + item for label, item in zip(labels, block["items"]))
            elif kind == "question":
                id_separator = block.get("id_separator", ".")
                label_separator = block.get("label_separator", ".")
                question_label = block.get("question_label", block["id"] + id_separator)
                text.append(question_label + " " + block["prompt"])
                option_labels = block.get("option_labels")
                if option_labels is None:
                    option_labels = [label + label_separator
                                     for label in block.get("labels", "ABCDE")]
                if len(option_labels) != len(block["options"]):
                    raise ValueError("Answer-option labels must match the number of options")
                text.extend(label + " " + option
                            for label, option in zip(option_labels, block["options"]))
            elif kind == "references":
                text.extend(item["label"] for item in block["items"])
            elif kind == "route":
                # Decorative Voyage flowable has no authored lesson wording.
                continue
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
    report[label] = {"passed": True, "normalized_characters": len(a),
                     "non_whitespace_characters": len(re.sub(r"\s", "", a))}


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
