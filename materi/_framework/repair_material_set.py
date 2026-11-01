#!/usr/bin/env python3
"""Preflight, render, audit, and promote reviewed LBE/PBM repair compositions.

This runner consumes human-reviewed lesson JSON directly. It deliberately does
not import or call the previous automatic lesson extractor or paginator.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Any

import pymupdf
from reportlab.platypus import KeepTogether, Paragraph

ROOT = Path(__file__).resolve().parents[2]
FRAMEWORK = ROOT / "materi/_framework"
REPAIR_ROOT = ROOT / "tmp/pdfs/material-repair"
MANIFEST_PATH = REPAIR_ROOT / "manifest.json"
PREVIEW_SOURCE = FRAMEWORK / "examples/pbm1.lesson.json"
PREVIEW_SOURCE_TEXT = FRAMEWORK / "examples/pbm1.source.txt"
PREVIEW_REVIEW = FRAMEWORK / "examples/pbm1-fidelity.md"
PRESERVED_INDICES = {("PBM", 2), ("PBM", 3)}
EXPECTED_REPAIR_KEYS = (
    {("LBE", index) for index in range(1, 16)}
    | {("PBM", 1)}
    | {("PBM", index) for index in range(4, 16)}
)
PRESERVED_MASTERS = {
    2: {
        "lesson": "materi/_framework/examples/PBM/02-makna-kata-frasa.lesson.json",
        "pdf": "output/pdf/PBM/02-makna-kata-frasa-berlian-ptn-pro.pdf",
        "fidelity": "output/pdf/PBM/02-makna-kata-frasa-berlian-ptn-pro-fidelity.json",
        "source_pdf": "materi/downloaded-from-google-doc/PBM/02 - Makna Kata & Frasa.pdf",
        "source_sha256": "d7a668382ed2b8379cec8ca1c2873d001c7750ee5c53c87b8f404b1c03666514",
        "visual_review": "PBM 02 previously reviewed at readable size; see repair playbook.",
    },
    3: {
        "lesson": "materi/_framework/examples/PBM/03-morfologi-pembentukan-kata.lesson.json",
        "pdf": "output/pdf/PBM/03-morfologi-pembentukan-kata-berlian-ptn-pro.pdf",
        "fidelity": "output/pdf/PBM/03-morfologi-pembentukan-kata-berlian-ptn-pro-fidelity.json",
        "source_pdf": "materi/downloaded-from-google-doc/PBM/03 - Morfologi & Pembentukan Kata.pdf",
        "source_sha256": "269d484928aa142f314ef1e3426f28ecf927fca7c9b776b90384ff105783fa15",
        "visual_review": "PBM 03 previously reviewed at readable size; see repair playbook.",
    },
}
SOURCE_MARKER = re.compile(r"(?m)^\[\[SOURCE PAGE (\d{3})\]\][ \t]*$")
LEGACY_SOURCE_MARKER = re.compile(r"(?m)^--- PAGE (\d+) ---[ \t]*$")

sys.path.insert(0, str(FRAMEWORK))
import check_fidelity  # noqa: E402
import inspect_pdf  # noqa: E402
import render  # noqa: E402


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")
    temporary.replace(path)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_source_pdf(entry: dict) -> str:
    source_path = ROOT / entry["source_pdf"]
    expected = entry.get("source_sha256")
    if not source_path.is_file():
        raise FileNotFoundError(f"Source PDF is missing: {source_path.relative_to(ROOT)}")
    if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", expected):
        raise ValueError("Manifest source_sha256 must be a 64-character SHA-256 digest")
    actual = sha256(source_path)
    if actual.lower() != expected.lower():
        raise ValueError(
            f"Source PDF checksum mismatch for {entry['source_pdf']}: "
            f"expected {expected}, found {actual}"
        )
    return actual


def canonical(text: str) -> str:
    return check_fidelity.canonical(text)


def split_marked_pages(text: str, marker: re.Pattern[str]) -> dict[int, str]:
    matches = list(marker.finditer(text))
    if not matches:
        raise ValueError("Source-order transcript has no source-page markers")
    if text[:matches[0].start()].strip():
        raise ValueError("Text appears before the first source-page marker")
    pages: dict[int, str] = {}
    for index, match in enumerate(matches):
        page_number = int(match.group(1))
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        if page_number in pages:
            raise ValueError(f"Duplicate source-page marker: {page_number}")
        pages[page_number] = text[match.end():end].strip()
    return pages


def parse_review_frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---", 4)
    if end < 0:
        return {}
    values = {}
    for line in text[4:end].splitlines():
        match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*?)\s*$", line)
        if match:
            values[match.group(1)] = match.group(2).strip().strip("\"'")
    return values


def reset_visual_review(review_path: Path) -> None:
    """Clear approvals so each newly rendered candidate needs fresh review."""
    text = review_path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"Review note has no YAML frontmatter: {review_path}")
    end = text.find("\n---", 4)
    if end < 0:
        raise ValueError(f"Review note frontmatter is unterminated: {review_path}")
    updates = {
        "visual_review": "pending",
        "visual_pages_reviewed": "0",
        "visual_pdf_sha256": "pending",
    }
    seen = set()
    lines = []
    for line in text[4:end].splitlines():
        match = re.match(r"^([A-Za-z0-9_-]+):\s*", line)
        if match and match.group(1) in updates:
            key = match.group(1)
            lines.append(f"{key}: {updates[key]}")
            seen.add(key)
        else:
            lines.append(line)
    for key, value in updates.items():
        if key not in seen:
            lines.append(f"{key}: {value}")
    reset = "---\n" + "\n".join(lines) + "\n---" + text[end + 4:]
    review_path.write_text(reset, encoding="utf-8")


def expected_source_pages(entry: dict) -> list[int]:
    explicit = entry.get("source_page_numbers")
    if explicit:
        return [int(page) for page in explicit]
    bounds = entry.get("source_page_range")
    if not bounds or len(bounds) != 2:
        raise ValueError("Source manifest has no page range")
    return list(range(int(bounds[0]), int(bounds[1]) + 1))


def material_inputs(entry: dict) -> dict[str, Path]:
    code, index = entry["code"], int(entry["index"])
    if (code, index) in PRESERVED_INDICES:
        raise ValueError(f"Preserved master {code} {index:02d} must not be rewritten")
    if code == "PBM" and index == 1:
        return {
            "lesson": PREVIEW_SOURCE,
            "source_order": PREVIEW_SOURCE_TEXT,
            "review": PREVIEW_REVIEW,
        }
    repair_folder = REPAIR_ROOT / "repairs" / code
    prefix = Path(entry["evidence_dir"]).name
    nested_folder = repair_folder / prefix
    suffixes = ("lesson.json", "source-order.txt", "review.md", "recipe.py")
    nested_has_inputs = any(
        (nested_folder / f"{prefix}.{suffix}").is_file() for suffix in suffixes
    )
    flat_has_inputs = any(
        (repair_folder / f"{prefix}.{suffix}").is_file() for suffix in suffixes
    )
    if nested_has_inputs and flat_has_inputs:
        raise ValueError(
            f"Ambiguous flat and nested staging inputs for {code} {index:02d}"
        )
    folder = nested_folder if nested_has_inputs else repair_folder
    return {
        "lesson": folder / f"{prefix}.lesson.json",
        "source_order": folder / f"{prefix}.source-order.txt",
        "review": folder / f"{prefix}.review.md",
        "recipe": folder / f"{prefix}.recipe.py",
    }


def source_page_records(entry: dict) -> dict[int, tuple[dict, Path]]:
    result = {}
    for page in entry.get("page_evidence", []):
        number = int(page["source_page_number"])
        json_path = ROOT / page["json"]
        if number in result:
            raise ValueError(f"Duplicate source evidence page {number}")
        evidence = read_json(json_path)
        if evidence.get("source_pdf") != entry.get("source_pdf"):
            raise ValueError(f"Source evidence page {number} names a different source PDF")
        if int(evidence.get("source_page_number", 0)) != number:
            raise ValueError(f"Source evidence page number mismatch for {json_path}")
        result[number] = (evidence, json_path)
    return result


def source_evidence_hashes(entry: dict) -> dict[str, str]:
    return {
        page["json"]: sha256(ROOT / page["json"])
        for page in entry.get("page_evidence", [])
    }


def _page_ref_in_note(note: str, page_number: int) -> bool:
    patterns = (
        rf"(?i)source\s+page\s+0*{page_number}\b",
        rf"(?i)source-page-0*{page_number}\b",
        rf"(?i)\bpage\s+0*{page_number}\b",
    )
    return any(re.search(pattern, note) for pattern in patterns)


def instantiate_recipe(entry: dict) -> str | None:
    """Instantiate one optional reviewed composition recipe in memory, then stage its outputs."""
    source_sha_before = verify_source_pdf(entry)
    evidence_sha_before = source_evidence_hashes(entry)
    paths = material_inputs(entry)
    recipe_path = paths.get("recipe")
    if recipe_path is None or not recipe_path.is_file():
        return None
    recipe_sha_before = sha256(recipe_path)
    expected_pages = expected_source_pages(entry)
    records = source_page_records(entry)
    if sorted(records) != expected_pages:
        raise ValueError("Recipe cannot run: source evidence pages do not match manifest coverage")
    source_pages = [records[number][0] for number in expected_pages]
    material = dict(entry)
    material["expected_source_pages"] = expected_pages

    module_name = f"repair_recipe_{entry['code'].lower()}_{int(entry['index']):02d}"
    spec = importlib.util.spec_from_file_location(module_name, recipe_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load recipe module: {recipe_path}")
    module = importlib.util.module_from_spec(spec)
    recipe_directory = str(recipe_path.parent)
    modules_before = set(sys.modules)
    inserted_directory = recipe_directory not in sys.path
    if inserted_directory:
        sys.path.insert(0, recipe_directory)
    try:
        spec.loader.exec_module(module)
        compose = getattr(module, "compose", None)
        if not callable(compose):
            raise TypeError("Recipe must export callable compose(material, source_pages)")
        result = compose(material, source_pages)
    finally:
        if inserted_directory:
            sys.path.remove(recipe_directory)
        recipe_parent = recipe_path.parent.resolve()
        for name, imported in list(sys.modules.items()):
            if name in modules_before:
                continue
            module_file = getattr(imported, "__file__", None)
            if not module_file:
                continue
            try:
                imported_path = Path(module_file).resolve()
                if imported_path == recipe_parent or recipe_parent in imported_path.parents:
                    del sys.modules[name]
            except OSError:
                continue
    if verify_source_pdf(entry) != source_sha_before:
        raise ValueError("Source PDF changed while its composition recipe was running")
    if source_evidence_hashes(entry) != evidence_sha_before:
        raise ValueError("Source evidence changed while its composition recipe was running")
    if sha256(recipe_path) != recipe_sha_before:
        raise ValueError("Composition recipe changed while it was running")
    if not isinstance(result, dict):
        raise TypeError("Recipe compose() must return a dictionary")
    lesson = result.get("lesson")
    order_pages = result.get("source_order_pages")
    review = result.get("review")
    review_markdown = result.get("review_markdown")
    if not isinstance(lesson, dict) or not isinstance(review, dict):
        raise TypeError("Recipe result needs lesson and review dictionaries")
    if not isinstance(order_pages, list) or not isinstance(review_markdown, str):
        raise TypeError("Recipe result needs source_order_pages and review_markdown")
    ordered_numbers = [int(item["source_page_number"]) for item in order_pages]
    if ordered_numbers != expected_pages:
        raise ValueError(
            f"Recipe source-order pages must be exactly {expected_pages}, found {ordered_numbers}"
        )
    if any(not isinstance(item.get("text"), str) for item in order_pages):
        raise TypeError("Every recipe source-order page needs plain text")
    required_review = {
        "source_pages_reviewed": len(expected_pages),
        "source_transcript_verified": True,
        "semantic_review": "passed",
        "emphasis_review": "passed",
        "table_review": review.get("table_review"),
        "visual_review": "pending",
        "visual_pages_reviewed": 0,
    }
    for key, expected in required_review.items():
        if review.get(key) != expected:
            raise ValueError(f"Recipe review.{key} must be {expected!r}")
    if required_review["table_review"] not in ("passed", "not_applicable"):
        raise ValueError("Recipe review.table_review must be passed or not_applicable")
    if not review_markdown.strip():
        raise ValueError("Recipe review_markdown must document source and semantic review")

    paths["lesson"].parent.mkdir(parents=True, exist_ok=True)
    write_json(paths["lesson"], lesson)
    transcript = "\n\n".join(
        f"[[SOURCE PAGE {int(item['source_page_number']):03d}]]\n{item['text']}"
        for item in order_pages
    ) + "\n"
    paths["source_order"].write_text(transcript, encoding="utf-8")
    frontmatter = "\n".join(
        [*(f"{key}: {value}" for key, value in required_review.items()),
         "visual_pdf_sha256: pending"]
    )
    paths["review"].write_text(
        f"---\n{frontmatter}\n---\n\n{review_markdown.strip()}\n",
        encoding="utf-8",
    )
    return str(recipe_path.relative_to(ROOT))


def verify_source_transcript(entry: dict, paths: dict[str, Path], note: str,
                             frontmatter: dict[str, str]) -> dict:
    pages_expected = expected_source_pages(entry)
    source_sha = verify_source_pdf(entry)
    marker = LEGACY_SOURCE_MARKER if (entry["code"], int(entry["index"])) == ("PBM", 1) else SOURCE_MARKER
    page_texts = split_marked_pages(paths["source_order"].read_text(encoding="utf-8"), marker)
    if list(page_texts) != pages_expected:
        raise ValueError(
            f"Transcript markers must cover source pages in order; expected {pages_expected}, "
            f"found {list(page_texts)}"
        )

    source_records = source_page_records(entry)
    if sorted(source_records) != pages_expected:
        raise ValueError("Source evidence page inventory does not match the lesson range")

    page_checks = []
    reconstructed_pages = []
    mismatches = []
    source_pdf = pymupdf.open(ROOT / entry["source_pdf"])
    try:
        expected_source_page_count = int(entry.get("source_page_count", len(source_pdf)))
        if len(source_pdf) != expected_source_page_count:
            raise ValueError(
                f"Source PDF page count changed: expected {expected_source_page_count}, "
                f"found {len(source_pdf)}"
            )
        for page_number in pages_expected:
            transcript = page_texts[page_number]
            evidence, evidence_path = source_records[page_number]
            source_stream = (evidence.get("text") or {}).get("content_stream")
            if not isinstance(source_stream, str):
                raise ValueError(f"No source content-stream text for page {page_number}")
            live_source_stream = source_pdf[page_number - 1].get_text(sort=False)
            if canonical(source_stream) != canonical(live_source_stream):
                raise ValueError(
                    f"Source evidence text for page {page_number} no longer matches "
                    "the manifest-bound PDF"
                )
            same = canonical(source_stream) == canonical(transcript)
            reconstructed_pages.append(transcript)
            record = {
                "source_page": page_number,
                "source_evidence": str(evidence_path.relative_to(ROOT)),
                "source_pdf_sha256": source_sha,
                "source_evidence_sha256": sha256(evidence_path),
                "content_stream_exact": same,
                "method": "exact-content-stream" if same else "visual-reading-order-transcript",
            }
            if not same:
                mapped = (entry["code"], int(entry["index"])) == ("PBM", 1)
                mapped = mapped or _page_ref_in_note(note, page_number)
                if not mapped:
                    raise ValueError(
                        f"Source-order differs from content stream on page {page_number}; "
                        "review note must document its visual reconstruction"
                    )
                record["mapping_documented"] = True
                mismatches.append(page_number)
            page_checks.append(record)
    finally:
        source_pdf.close()

    pbm01_master = (entry["code"], int(entry["index"])) == ("PBM", 1)
    if not pbm01_master:
        if frontmatter.get("source_pages_reviewed") != str(len(pages_expected)):
            raise ValueError("Review note must declare every source page reviewed")
        if frontmatter.get("source_transcript_verified", "").lower() != "true":
            raise ValueError("Review note must mark the independent source transcript verified")
        if frontmatter.get("semantic_review", "").lower() != "passed":
            raise ValueError("Review note must mark semantic composition review passed")
        if frontmatter.get("emphasis_review", "").lower() != "passed":
            raise ValueError("Review note must mark source bold/italic review passed")
        if frontmatter.get("table_review", "").lower() not in ("passed", "not_applicable"):
            raise ValueError("Review note must mark table review passed or not applicable")
    else:
        if "verification" not in note.lower() or "source" not in note.lower():
            raise ValueError("PBM 01 master fidelity record is required")

    return {
        "passed": True,
        "source_pages": len(pages_expected),
        "source_pdf_sha256": source_sha,
        "page_checks": page_checks,
        "content_stream_matches": len(page_checks) - len(mismatches),
        "visual_order_reconstructions": mismatches,
        "ordered_transcript": " ".join(reconstructed_pages),
    }


def verify_page_coverage(entry: dict, lesson: dict) -> dict:
    expected = expected_source_pages(entry)
    observed = []
    for page in lesson.get("pages", []):
        sources = page.get("source_pages")
        if not isinstance(sources, list) or not sources:
            raise ValueError(f"Page {page.get('id')} has no source-page provenance")
        parsed = [int(source) for source in sources]
        if parsed != sorted(set(parsed)):
            raise ValueError(f"Page {page.get('id')} source_pages must be unique and ascending")
        if any(source not in expected for source in parsed):
            raise ValueError(f"Page {page.get('id')} cites a source page outside its material")
        observed.extend(parsed)
    # A logical continuation page may cite an earlier source page again when
    # its table repeats a source header above rows that continue later. Require
    # first-use order to match the source while allowing repeated provenance;
    # exact authored-text order is checked independently below.
    first_seen = []
    seen = set()
    for source in observed:
        if source not in seen:
            first_seen.append(source)
            seen.add(source)
    if first_seen != expected:
        raise ValueError(
            f"Logical pages introduce source pages out of order: expected {expected}, "
            f"first-seen {first_seen}"
        )
    covered = sorted(seen)
    if covered != expected:
        missing = sorted(set(expected) - set(covered))
        extra = sorted(set(covered) - set(expected))
        raise ValueError(f"Source-page coverage mismatch: missing={missing}, extra={extra}")
    return {"passed": True, "expected": expected, "covered": covered}


def source_style_inventory(entry: dict) -> list[dict]:
    inventory = []
    for page_number, (evidence, _) in sorted(source_page_records(entry).items()):
        spans = [span for block in evidence.get("text_blocks", [])
                 for line in block.get("lines", [])
                 for span in line.get("spans", [])]
        inventory.append({
            "source_page": page_number,
            "bold_spans": sum(bool(span.get("bold")) for span in spans),
            "italic_spans": sum(bool(span.get("italic")) for span in spans),
            "bold_italic_spans": sum(bool(span.get("bold") and span.get("italic"))
                                      for span in spans),
        })
    return inventory


def lesson_table_schema(lesson: dict) -> list[dict]:
    schema = []
    for page in lesson["pages"]:
        for block_index, block in enumerate(page["blocks"]):
            if block.get("type") != "table":
                continue
            schema.append({
                "page_id": page["id"],
                "block_index": block_index,
                "source_pages": page.get("source_pages", []),
                "column_count": len(block.get("headers", [])),
                "row_count": len(block.get("rows", [])),
                "row_widths": [len(row) for row in block.get("rows", [])],
                "has_source_header": any(block.get("headers", [])),
                "synthetic_header": bool(block.get("synthetic_header")),
            })
    return schema


def _flowable_height(flowable, width: float, available: float) -> float:
    if isinstance(flowable, KeepTogether):
        return sum(_flowable_height(child, width, available)
                   for child in getattr(flowable, "_content", []))
    if getattr(flowable, "height", None) is not None and flowable.__class__.__name__ == "Spacer":
        height = float(flowable.height)
    else:
        _, height = flowable.wrap(width, available)
    return float(height) + float(getattr(flowable, "spaceBefore", 0) or 0) + float(
        getattr(flowable, "spaceAfter", 0) or 0
    )


def page_height_estimates(lesson: dict) -> list[dict]:
    styles = render.styles()
    estimates = []
    frame_height = render.H - 147
    for index, page in enumerate(lesson["pages"]):
        total = 0.0
        if page.get("title"):
            style_name = "cover" if index == 0 and not lesson.get("verbatim") else "title"
            title = Paragraph(render.rich(page["title"]), styles[style_name])
            _, title_height = title.wrap(render.WIDTH, frame_height)
            total += title_height + float(title.style.spaceBefore or 0) + float(
                title.style.spaceAfter or 0
            )
        for flowable in render.make_blocks(page["blocks"], styles):
            total += _flowable_height(flowable, render.WIDTH, frame_height)
        estimates.append({
            "page_id": page["id"],
            "estimated_body_height_pt": round(total, 2),
            "available_body_height_pt": round(frame_height, 2),
            "fits": total <= frame_height,
        })
    return estimates


def verify_material(entry: dict) -> dict:
    code, index = entry["code"], int(entry["index"])
    result = {"code": code, "index": index, "status": "failed", "errors": []}
    try:
        paths = material_inputs(entry)
        for label, path in paths.items():
            if label == "recipe" and not path.is_file():
                continue
            if not path.is_file():
                raise FileNotFoundError(f"Missing {label} input: {path.relative_to(ROOT)}")
        source_sha_before = verify_source_pdf(entry)
        evidence_paths = [ROOT / page["json"] for page in entry.get("page_evidence", [])]
        missing_evidence = [path for path in evidence_paths if not path.is_file()]
        if missing_evidence:
            raise FileNotFoundError(
                "Missing source evidence JSON: " + ", ".join(
                    str(path.relative_to(ROOT)) for path in missing_evidence
                )
            )
        input_snapshot = {
            "source_pdf_sha256": source_sha_before,
            "lesson_sha256": sha256(paths["lesson"]),
            "source_order_sha256": sha256(paths["source_order"]),
            "review_note_sha256": sha256(paths["review"]),
            "source_evidence_sha256": source_evidence_hashes(entry),
            "source_recipe_sha256": (
                sha256(paths["recipe"])
                if paths.get("recipe") and paths["recipe"].is_file() else None
            ),
        }
        lesson = read_json(paths["lesson"])
        note = paths["review"].read_text(encoding="utf-8")
        frontmatter = parse_review_frontmatter(note)

        if lesson.get("code") != code:
            raise ValueError(f"Lesson code mismatch: expected {code}, found {lesson.get('code')!r}")
        if lesson.get("source") != entry.get("source_pdf"):
            if not ((code, index) == ("PBM", 1)
                    and lesson.get("source") == "materi/pbm1.pdf"
                    and sha256(ROOT / lesson["source"]) == entry.get("source_sha256")):
                raise ValueError(
                    f"Lesson source mismatch: expected {entry.get('source_pdf')!r}, "
                    f"found {lesson.get('source')!r}"
                )
        if lesson.get("verbatim") is not True:
            raise ValueError("Lesson must declare verbatim: true")
        render.validate(lesson)
        coverage = verify_page_coverage(entry, lesson)
        source = verify_source_transcript(entry, paths, note, frontmatter)
        authored = check_fidelity.authored_text(lesson)
        check_fidelity.require_equal(
            source["ordered_transcript"], authored, "source_transcript_to_lesson", result
        )
        heights = page_height_estimates(lesson)
        overfull = [page for page in heights if not page["fits"]]
        if overfull:
            raise ValueError(f"Pages exceed the body frame: {overfull}")
        style_inventory = source_style_inventory(entry)

        current_inputs = {
            "source_pdf_sha256": verify_source_pdf(entry),
            "lesson_sha256": sha256(paths["lesson"]),
            "source_order_sha256": sha256(paths["source_order"]),
            "review_note_sha256": sha256(paths["review"]),
            "source_evidence_sha256": source_evidence_hashes(entry),
            "source_recipe_sha256": (
                sha256(paths["recipe"])
                if paths.get("recipe") and paths["recipe"].is_file() else None
            ),
        }
        if current_inputs != input_snapshot:
            raise ValueError("Source or staged inputs changed during composition preflight")

        result.update({
            "status": "passed",
            "staged_lesson_json": str(paths["lesson"].relative_to(ROOT)),
            "staged_lesson_sha256": input_snapshot["lesson_sha256"],
            "source_order_transcript": str(paths["source_order"].relative_to(ROOT)),
            "source_order_sha256": input_snapshot["source_order_sha256"],
            "review_note_sha256": input_snapshot["review_note_sha256"],
            "source_pdf_sha256": input_snapshot["source_pdf_sha256"],
            "source_evidence_sha256": input_snapshot["source_evidence_sha256"],
            "source_recipe_sha256": input_snapshot["source_recipe_sha256"],
            "review_note": str(paths["review"].relative_to(ROOT)),
            "source_recipe": (str(paths["recipe"].relative_to(ROOT))
                              if paths.get("recipe", Path()).is_file() else None),
            "source_transcript": {key: value for key, value in source.items()
                                  if key != "ordered_transcript"},
            "source_page_coverage": coverage,
            "source_to_editable": result["source_transcript_to_lesson"],
            "output_pages_expected": len(lesson["pages"]),
            "page_heights": heights,
            "table_count": sum(block.get("type") == "table"
                                for page in lesson["pages"] for block in page["blocks"]),
            "table_schema": lesson_table_schema(lesson),
            "source_style_inventory": style_inventory,
            "lesson_title": lesson["title"],
            "output_pdf": entry.get("existing_output_pdf"),
        })
    except Exception as error:
        result["errors"].append(f"{type(error).__name__}: {error}")
    return result


def audit_preserved_masters(manifest: dict) -> list[dict]:
    results = []
    for index, paths in PRESERVED_MASTERS.items():
        result = {"code": "PBM", "index": index, "status": "failed", "errors": []}
        try:
            lesson_path, pdf_path, report_path = (ROOT / paths[key]
                                                   for key in ("lesson", "pdf", "fidelity"))
            for label, path in (("lesson", lesson_path), ("PDF", pdf_path),
                                ("fidelity report", report_path)):
                if not path.is_file():
                    raise FileNotFoundError(f"Missing preserved PBM {index:02d} {label}: {path}")
            lesson_sha_before = sha256(lesson_path)
            pdf_sha_before = sha256(pdf_path)
            lesson = read_json(lesson_path)
            report = read_json(report_path)
            expected_pages = len(lesson.get("pages", []))
            source_entry = {
                "source_pdf": paths["source_pdf"],
                "source_sha256": paths["source_sha256"],
            }
            source_path = ROOT / source_entry["source_pdf"]
            source_sha = verify_source_pdf(source_entry)
            reported_source = Path(report.get("source", ""))
            if not reported_source.is_absolute():
                reported_source = ROOT / reported_source
            if reported_source.resolve() != source_path.resolve():
                raise ValueError(
                    f"Preserved PBM {index:02d} fidelity report names a different source PDF"
                )
            source = pymupdf.open(source_path)
            try:
                source_page_count = len(source)
                source_text = "\n".join(page.get_text(sort=False) for page in source)
            finally:
                source.close()
            pdf = pymupdf.open(pdf_path)
            try:
                actual_pages = len(pdf)
                rendered_body = " ".join(
                    page.get_text(clip=pymupdf.Rect(
                        0, 68, page.rect.width, page.rect.height - 54
                    )) for page in pdf
                )
            finally:
                pdf.close()
            if lesson.get("code") != "PBM" or lesson.get("verbatim") is not True:
                raise ValueError("Preserved lesson metadata is invalid")
            if expected_pages != actual_pages or report.get("output_pages") != actual_pages:
                raise ValueError("Preserved PDF page count differs from lesson/report")
            source_check = {}
            check_fidelity.require_equal(
                source_text, check_fidelity.authored_text(lesson),
                "preserved_source_to_editable", source_check
            )
            rendered_check = {}
            check_fidelity.require_equal(
                check_fidelity.authored_text(lesson), rendered_body,
                "preserved_editable_to_rendered", rendered_check
            )
            visual_review = report.get("visual_review", {})
            if (visual_review.get("status") != "passed"
                    or visual_review.get("pages_reviewed") != actual_pages):
                raise ValueError("Preserved PBM visual review record is missing or incomplete")
            if (sha256(lesson_path) != lesson_sha_before
                    or sha256(pdf_path) != pdf_sha_before
                    or verify_source_pdf(source_entry) != source_sha):
                raise ValueError(f"Preserved PBM {index:02d} inputs changed during live audit")
            result.update({
                "status": "passed",
                "lesson_json": paths["lesson"],
                "output_pdf": paths["pdf"],
                "fidelity_report": paths["fidelity"],
                "output_pages": actual_pages,
                "lesson_sha256": lesson_sha_before,
                "pdf_sha256": pdf_sha_before,
                "source_pdf": source_entry["source_pdf"],
                "source_pdf_sha256": source_sha,
                "source_page_count": source_page_count,
                "fidelity": {
                    "source_to_editable": True,
                    "live_source_to_editable": source_check["preserved_source_to_editable"],
                    "editable_to_rendered": True,
                    "live_pdf_body_check": rendered_check["preserved_editable_to_rendered"],
                },
                "visual_review": {
                    "status": "previously-passed",
                    "pages_reviewed": actual_pages,
                    "evidence": paths["visual_review"],
                },
            })
        except Exception as error:
            result["errors"].append(f"{type(error).__name__}: {error}")
        results.append(result)
    return results


def run_preflight(manifest: dict) -> int:
    # A new preflight means the staged source may have changed. Invalidate any
    # candidate approvals from an earlier pass before inspecting this set.
    manifest["phase"] = "composition-preflight"
    manifest["phase_status"] = "in-progress"
    manifest.pop("candidate_render_audit", None)
    manifest.pop("promotion", None)
    manifest.pop("final_delivery", None)
    write_json(MANIFEST_PATH, manifest)
    render.register_fonts()
    manifest_entries = manifest.get("materials", [])
    manifest_keys = [(entry.get("code"), int(entry.get("index", 0)))
                     for entry in manifest_entries]
    manifest_key_set = set(manifest_keys)
    inventory_errors = list(manifest.get("inventory_errors", []))
    if len(manifest_keys) != len(manifest_key_set):
        inventory_errors.append("Source manifest contains duplicate material keys")
    missing_keys = sorted(EXPECTED_REPAIR_KEYS - manifest_key_set)
    extra_keys = sorted(manifest_key_set - EXPECTED_REPAIR_KEYS)
    if missing_keys:
        inventory_errors.append(f"Missing repair materials: {missing_keys}")
    if extra_keys:
        inventory_errors.append(f"Unexpected source materials: {extra_keys}")
    inventory_audit = {
        "passed": not inventory_errors,
        "expected_materials": len(EXPECTED_REPAIR_KEYS),
        "observed_materials": len(manifest_keys),
        "missing": missing_keys,
        "unexpected": extra_keys,
        "errors": inventory_errors,
    }
    manifest["repair_inventory_audit"] = inventory_audit
    entries = [entry for entry in manifest.get("materials", [])
               if (entry.get("code"), int(entry.get("index", 0))) not in PRESERVED_INDICES]
    recipe_errors = {}
    for entry in entries:
        key = (entry["code"], int(entry["index"]))
        try:
            instantiate_recipe(entry)
        except Exception as error:
            recipe_errors[key] = f"{type(error).__name__}: {error}"
    results = []
    for entry in entries:
        key = (entry["code"], int(entry["index"]))
        if key in recipe_errors:
            results.append({"code": key[0], "index": key[1], "status": "failed",
                            "errors": [f"Recipe: {recipe_errors[key]}"]})
        else:
            results.append(verify_material(entry))
    passed = sum(item["status"] == "passed" for item in results)
    preserved = audit_preserved_masters(manifest)
    preserved_passed = sum(item["status"] == "passed" for item in preserved)
    manifest["phase"] = "composition-preflight"
    manifest["phase_status"] = (
        "complete" if (passed == len(entries) and len(entries) == 28
                       and preserved_passed == 2 and inventory_audit["passed"])
        else "complete-with-errors"
    )
    manifest["composition_preflight"] = {
        "expected_materials": 28,
        "passed_materials": passed,
        "failed_materials": max(0, 28 - passed),
        "materials": results,
    }
    manifest["preserved_master_audit"] = {
        "expected_materials": 2,
        "passed_materials": preserved_passed,
        "failed_materials": 2 - preserved_passed,
        "materials": preserved,
    }
    manifest.setdefault("summary", {})["composition_preflight_passed"] = passed
    manifest["summary"]["composition_preflight_failed"] = max(0, 28 - passed)
    manifest["summary"]["repair_inventory_passed"] = inventory_audit["passed"]
    manifest["summary"]["preserved_masters_audited"] = preserved_passed
    manifest["summary"]["total_materials_audited"] = passed + preserved_passed
    write_json(MANIFEST_PATH, manifest)
    for result in results:
        status = result["status"]
        title = result.get("lesson_title", "")
        errors = "; ".join(result.get("errors", []))
        print(f"{result['code']} {result['index']:02d}: {status} {title} {errors}".rstrip())
    for result in preserved:
        print(f"{result['code']} {result['index']:02d}: preserved audit {result['status']} "
              f"{'; '.join(result.get('errors', []))}".rstrip())
    print(json.dumps({"phase": "composition-preflight", "passed": passed,
                      "failed": max(0, 28 - passed),
                      "inventory_passed": inventory_audit["passed"],
                      "preserved_masters_passed": preserved_passed,
                      "manifest": str(MANIFEST_PATH.relative_to(ROOT))}, indent=2))
    return 0 if (passed == 28 and len(entries) == 28 and preserved_passed == 2
                 and inventory_audit["passed"]) else 1


def remove_synthetic_headers(actual: str, lesson_page: dict) -> str:
    # Normalize authored markup through the same content path used for page
    # fidelity. Markdown emphasis markers are authored styling, not PDF text.
    expected = canonical(check_fidelity.authored_text({"pages": [lesson_page]}))
    candidates = {canonical(actual)}
    for block in lesson_page.get("blocks", []):
        if block.get("type") != "table" or not block.get("synthetic_header"):
            continue
        header_lesson = {
            "pages": [{
                "title": "",
                "blocks": [{"type": "paragraph", "text": " ".join(block.get("headers", []))}],
            }]
        }
        header = canonical(check_fidelity.authored_text(header_lesson))
        if not header:
            continue
        next_candidates = set()
        for candidate in candidates:
            offsets = [match.start() for match in re.finditer(re.escape(header), candidate)]
            for offset in offsets:
                next_candidates.add(canonical(
                    candidate[:offset] + candidate[offset + len(header):]
                ))
        candidates = next_candidates
        if not candidates:
            raise ValueError(f"Could not uniquely identify synthetic table header: {header}")
    matches = {candidate for candidate in candidates if candidate == expected}
    if len(matches) != 1:
        raise ValueError(
            "Rendered page does not have one complete authored-text match after removing "
            "synthetic table headers"
        )
    return matches.pop()


def candidate_paths(entry: dict) -> dict[str, Path]:
    name = Path(entry["existing_output_pdf"]).name
    stem = Path(name).stem
    code = entry["code"]
    return {
        "pdf": REPAIR_ROOT / "candidates" / code / name,
        "pages": REPAIR_ROOT / "pages" / code / stem,
        "fidelity": REPAIR_ROOT / "reports" / f"{stem}-fidelity.json",
    }


def audit_candidate(entry: dict, lesson: dict, lesson_path: Path,
                    paths: dict[str, Path],
                    source_transcript: dict,
                    source_order_path: Path,
                    preflight_result: dict) -> dict:
    result = {"status": "failed", "errors": []}
    try:
        source_sha_before = verify_source_pdf(entry)
        evidence_sha_before = source_evidence_hashes(entry)
        lesson_sha_before = sha256(lesson_path)
        source_order_sha_before = sha256(source_order_path)
        if lesson_sha_before != preflight_result.get("staged_lesson_sha256"):
            raise ValueError("Staged lesson changed after composition preflight")
        if source_order_sha_before != preflight_result.get("source_order_sha256"):
            raise ValueError("Source-order transcript changed after composition preflight")
        if source_sha_before != preflight_result.get("source_pdf_sha256"):
            raise ValueError("Source PDF changed after composition preflight")
        if evidence_sha_before != preflight_result.get("source_evidence_sha256"):
            raise ValueError("Source evidence changed after composition preflight")
        paths["pdf"].parent.mkdir(parents=True, exist_ok=True)
        if paths["pages"].exists():
            shutil.rmtree(paths["pages"])
        for output in (paths["pdf"], paths["fidelity"]):
            output.unlink(missing_ok=True)
        render.build(lesson, paths["pdf"])
        try:
            inspect_pdf.inspect(paths["pdf"], paths["pages"], lesson_path)
        except SystemExit as error:
            if int(error.code or 0) != 0:
                raise ValueError(f"PDF bounds/font audit exited {error.code}") from error

        pdf = pymupdf.open(paths["pdf"])
        try:
            if len(pdf) != len(lesson["pages"]):
                raise ValueError(
                    f"Expected {len(lesson['pages'])} pages, found {len(pdf)}"
                )
            rendered_pages = []
            per_page = []
            for number, (pdf_page, lesson_page) in enumerate(zip(pdf, lesson["pages"]), 1):
                actual = pdf_page.get_text(clip=pymupdf.Rect(
                    0, 68, pdf_page.rect.width, pdf_page.rect.height - 54
                ))
                actual = remove_synthetic_headers(actual, lesson_page)
                expected = canonical(check_fidelity.authored_text({"pages": [lesson_page]}))
                check_fidelity.require_equal(expected, actual,
                                             f"rendered_page_{number}", result)
                rendered_pages.append(actual)
                per_page.append({"page": number, "passed": True,
                                 "source_pages": lesson_page.get("source_pages", [])})
            body = " ".join(rendered_pages)
            authored = check_fidelity.authored_text(lesson)
            check_fidelity.require_equal(authored, body, "editable_to_rendered", result)
            source_text = source_transcript["ordered_transcript"]
            check_fidelity.require_equal(source_text, body, "source_to_rendered", result)
            result.update({"output_pages": len(pdf), "per_page": per_page})
        finally:
            pdf.close()
        preview_images = sorted(paths["pages"].glob("page-*.png"))
        if len(preview_images) != len(lesson["pages"]):
            raise ValueError(
                f"Expected {len(lesson['pages'])} fresh page images, found {len(preview_images)}"
            )
        audit_path = paths["pages"] / "audit.json"
        audit = read_json(audit_path) if audit_path.is_file() else {}
        if audit.get("issues"):
            raise ValueError(f"PDF page audit has issues: {audit['issues']}")
        lesson_sha_after = sha256(lesson_path)
        if lesson_sha_after != lesson_sha_before:
            raise ValueError("Staged lesson changed while its candidate was being rendered")
        source_order_sha_after = sha256(source_order_path)
        if source_order_sha_after != source_order_sha_before:
            raise ValueError("Source-order transcript changed while its candidate was being rendered")
        source_sha_after = verify_source_pdf(entry)
        if source_sha_after != source_sha_before:
            raise ValueError("Source PDF changed while its candidate was being rendered")
        evidence_sha_after = source_evidence_hashes(entry)
        if evidence_sha_after != evidence_sha_before:
            raise ValueError("Source evidence changed while its candidate was being rendered")
        candidate_sha = sha256(paths["pdf"])
        write_json(paths["fidelity"], {
            "source_order": "independent per-page visual transcript",
            "comparisons": {
                key: value for key, value in result.items()
                if isinstance(value, dict) and "passed" in value
            },
            "output_pages": result.get("output_pages"),
            "candidate_pdf": str(paths["pdf"].relative_to(ROOT)),
            "audited_lesson_sha256": lesson_sha_after,
            "audited_source_order_sha256": source_order_sha_after,
            "audited_source_pdf_sha256": source_sha_after,
            "audited_source_evidence_sha256": evidence_sha_after,
            "audited_candidate_pdf_sha256": candidate_sha,
        })
        result.update({
            "status": "passed",
            "audited_lesson_sha256": lesson_sha_after,
            "audited_source_order_sha256": source_order_sha_after,
            "audited_source_pdf_sha256": source_sha_after,
            "audited_source_evidence_sha256": evidence_sha_after,
            "audited_candidate_pdf_sha256": candidate_sha,
            "candidate_pdf": str(paths["pdf"].relative_to(ROOT)),
            "page_images_dir": str(paths["pages"].relative_to(ROOT)),
            "page_images": [str(path.relative_to(ROOT)) for path in preview_images],
            "fidelity_report": str(paths["fidelity"].relative_to(ROOT)),
            "audit_report": str(audit_path.relative_to(ROOT)),
        })
    except Exception as error:
        result["errors"].append(f"{type(error).__name__}: {error}")
    return result


def run_candidates(manifest: dict) -> int:
    preflight = manifest.get("composition_preflight", {})
    materials = preflight.get("materials", [])
    if (preflight.get("expected_materials") != 28
            or preflight.get("passed_materials") != 28
            or manifest.get("repair_inventory_audit", {}).get("passed") is not True
            or manifest.get("preserved_master_audit", {}).get("passed_materials") != 2):
        raise ValueError("All 28 composition preflights must pass before candidate rendering")
    # Invalidate old candidate state before resetting reviews or touching any
    # output path, so an interrupted rerender cannot leave stale approvals usable.
    manifest["phase"] = "candidate-render-audit"
    manifest["phase_status"] = "in-progress"
    manifest.pop("candidate_render_audit", None)
    manifest.pop("promotion", None)
    manifest.pop("final_delivery", None)
    write_json(MANIFEST_PATH, manifest)
    results_by_key = {(item["code"], int(item["index"])): item for item in materials}
    if set(results_by_key) != EXPECTED_REPAIR_KEYS or len(materials) != len(EXPECTED_REPAIR_KEYS):
        raise ValueError("Candidate rendering requires the exact 28-material repair set")
    source_entries = {(entry["code"], int(entry["index"])): entry
                      for entry in manifest["materials"]}
    candidate_order = [("PBM", 4)] + [key for key in results_by_key if key != ("PBM", 4)]
    # A render invocation creates a new review target even if its page count is
    # unchanged. Clear direct-trio approvals before any candidate is produced.
    for key in candidate_order:
        if key == ("PBM", 1):
            continue
        review_path = material_inputs(source_entries[key])["review"]
        reset_visual_review(review_path)
    render_results = []
    for key in candidate_order:
        result = {"code": key[0], "index": key[1], "status": "failed", "errors": []}
        try:
            entry = source_entries[key]
            paths = material_inputs(entry)
            preflight_result = results_by_key[key]
            if sha256(paths["lesson"]) != preflight_result.get("staged_lesson_sha256"):
                raise ValueError("Staged lesson changed after composition preflight; rerun preflight")
            if sha256(paths["source_order"]) != preflight_result.get("source_order_sha256"):
                raise ValueError("Source-order transcript changed after composition preflight")
            if verify_source_pdf(entry) != preflight_result.get("source_pdf_sha256"):
                raise ValueError("Source PDF changed after composition preflight")
            if source_evidence_hashes(entry) != preflight_result.get("source_evidence_sha256"):
                raise ValueError("Source evidence changed after composition preflight")
            recipe_path = paths.get("recipe")
            current_recipe_sha = (
                sha256(recipe_path) if recipe_path and recipe_path.is_file() else None
            )
            if current_recipe_sha != preflight_result.get("source_recipe_sha256"):
                raise ValueError("Composition recipe changed after composition preflight")
            lesson = read_json(paths["lesson"])
            if sha256(paths["lesson"]) != preflight_result.get("staged_lesson_sha256"):
                raise ValueError("Staged lesson changed while it was being loaded")
            result["title"] = lesson.get("title", "")
            # Re-read the independent transcript so rendered text is compared
            # against the same reviewed source order used during preflight.
            note = paths["review"].read_text(encoding="utf-8")
            transcript_data = verify_source_transcript(
                entry, paths, note, parse_review_frontmatter(note)
            )
            result.update(audit_candidate(
                entry, lesson, paths["lesson"], candidate_paths(entry), transcript_data,
                paths["source_order"], preflight_result
            ))
        except Exception as error:
            result["errors"].append(f"{type(error).__name__}: {error}")
        render_results.append(result)
    passed = sum(item["status"] == "passed" for item in render_results)
    manifest["phase"] = "candidate-render-audit"
    manifest["phase_status"] = "complete" if passed == 28 else "complete-with-errors"
    manifest["candidate_render_audit"] = {
        "expected_materials": 28,
        "passed_materials": passed,
        "failed_materials": 28 - passed,
        "materials": render_results,
    }
    manifest["candidate_render_audit"]["preserved_masters"] = manifest[
        "preserved_master_audit"
    ]["materials"]
    manifest.setdefault("summary", {})["candidate_rendered_and_audited"] = passed
    manifest["summary"]["candidate_failures"] = 28 - passed
    write_json(MANIFEST_PATH, manifest)
    for result in render_results:
        print(f"{result['code']} {result['index']:02d}: {result['status']} "
              f"{result['title']} {('; '.join(result.get('errors', [])))}".rstrip())
    print(json.dumps({"phase": "candidate-render-audit", "passed": passed,
                      "failed": 28 - passed,
                      "manifest": str(MANIFEST_PATH.relative_to(ROOT))}, indent=2))
    return 0 if passed == 28 else 1


def visual_review_status(entry: dict, candidate: dict) -> tuple[bool, str]:
    paths = material_inputs(entry)
    candidate_path = ROOT / candidate.get("candidate_pdf", "")
    audited_pdf_sha = candidate.get("audited_candidate_pdf_sha256")
    audited_lesson_sha = candidate.get("audited_lesson_sha256")
    audited_source_sha = candidate.get("audited_source_order_sha256")
    audited_pdf_source_sha = candidate.get("audited_source_pdf_sha256")
    audited_evidence_sha = candidate.get("audited_source_evidence_sha256")
    if (not candidate_path.is_file() or not audited_pdf_sha or not audited_lesson_sha
            or not audited_source_sha or not audited_pdf_source_sha or not audited_evidence_sha):
        return False, "candidate is missing its audited input hashes"
    if sha256(candidate_path) != audited_pdf_sha:
        return False, "candidate PDF changed after its fidelity audit"
    if not paths["lesson"].is_file() or sha256(paths["lesson"]) != audited_lesson_sha:
        return False, "staged lesson changed after its candidate audit"
    if not paths["source_order"].is_file() or sha256(paths["source_order"]) != audited_source_sha:
        return False, "source-order transcript changed after its candidate audit"
    try:
        if verify_source_pdf(entry) != audited_pdf_source_sha:
            return False, "source PDF changed after its candidate audit"
    except (FileNotFoundError, KeyError, ValueError) as error:
        return False, f"source PDF is no longer verified: {error}"
    try:
        current_evidence_sha = source_evidence_hashes(entry)
    except (FileNotFoundError, KeyError, ValueError) as error:
        return False, f"source evidence is no longer verified: {error}"
    if current_evidence_sha != audited_evidence_sha:
        return False, "source evidence changed after its candidate audit"
    if (entry["code"], int(entry["index"])) == ("PBM", 1):
        review = candidate.get("tools_owner_visual_review", {})
        expected = int(candidate.get("output_pages", 0))
        if (review.get("status") == "passed"
                and review.get("pages_reviewed") == expected
                and review.get("pdf_sha256") == audited_pdf_sha
                and review.get("lesson_sha256") == audited_lesson_sha
                and review.get("source_order_sha256") == audited_source_sha
                and review.get("source_pdf_sha256") == audited_pdf_source_sha
                and review.get("source_evidence_sha256") == audited_evidence_sha):
            return True, "passed"
        return False, "PBM 01 candidate must be visually reviewed by the tools owner"
    frontmatter = parse_review_frontmatter(paths["review"].read_text(encoding="utf-8"))
    expected = int(candidate.get("output_pages", 0))
    if frontmatter.get("visual_review", "").lower() != "passed":
        return False, "review note does not mark rendered visual review passed"
    if frontmatter.get("visual_pages_reviewed") != str(expected):
        return False, f"reviewed page count does not equal candidate page count {expected}"
    if frontmatter.get("visual_pdf_sha256", "").lower() != audited_pdf_sha:
        return False, "visual approval does not name the audited candidate PDF checksum"
    return True, "passed"


def promote_accepted(manifest: dict) -> int:
    render_audit = manifest.get("candidate_render_audit", {})
    if render_audit.get("expected_materials") != 28:
        raise ValueError("Candidate audit must include the full 28-material set")
    entries = {(entry["code"], int(entry["index"])): entry
               for entry in manifest.get("materials", [])}
    promoted = []
    pending = []
    for candidate in render_audit.get("materials", []):
        key = (candidate["code"], int(candidate["index"]))
        entry = entries[key]
        accepted, reason = visual_review_status(entry, candidate)
        if candidate.get("status") != "passed" or not accepted:
            pending.append({"code": key[0], "index": key[1],
                            "status": "pending", "reason": reason})
            continue
        paths = material_inputs(entry)
        lesson_destination = ROOT / entry["canonical_lesson_json"]
        pdf_destination = ROOT / entry["existing_output_pdf"]
        candidate_pdf = ROOT / candidate["candidate_pdf"]
        lesson_destination.parent.mkdir(parents=True, exist_ok=True)
        pdf_destination.parent.mkdir(parents=True, exist_ok=True)
        lesson_temp = lesson_destination.with_name(f".{lesson_destination.name}.repair.tmp")
        pdf_temp = pdf_destination.with_name(f".{pdf_destination.name}.repair.tmp")
        shutil.copy2(paths["lesson"], lesson_temp)
        shutil.copy2(candidate_pdf, pdf_temp)
        if sha256(lesson_temp) != candidate["audited_lesson_sha256"]:
            lesson_temp.unlink(missing_ok=True)
            pdf_temp.unlink(missing_ok=True)
            pending.append({"code": key[0], "index": key[1], "status": "pending",
                            "reason": "staged lesson changed while preparing promotion"})
            continue
        if sha256(paths["source_order"]) != candidate["audited_source_order_sha256"]:
            lesson_temp.unlink(missing_ok=True)
            pdf_temp.unlink(missing_ok=True)
            pending.append({"code": key[0], "index": key[1], "status": "pending",
                            "reason": "source-order transcript changed while preparing promotion"})
            continue
        try:
            current_evidence_sha = source_evidence_hashes(entry)
        except (FileNotFoundError, KeyError, ValueError) as error:
            current_evidence_sha = None
            evidence_error = str(error)
        else:
            evidence_error = "source evidence changed while preparing promotion"
        if current_evidence_sha != candidate["audited_source_evidence_sha256"]:
            lesson_temp.unlink(missing_ok=True)
            pdf_temp.unlink(missing_ok=True)
            pending.append({"code": key[0], "index": key[1], "status": "pending",
                            "reason": evidence_error})
            continue
        try:
            current_source_sha = verify_source_pdf(entry)
        except (FileNotFoundError, KeyError, ValueError) as error:
            current_source_sha = None
            source_error = str(error)
        else:
            source_error = "source PDF changed while preparing promotion"
        if current_source_sha != candidate["audited_source_pdf_sha256"]:
            lesson_temp.unlink(missing_ok=True)
            pdf_temp.unlink(missing_ok=True)
            pending.append({"code": key[0], "index": key[1], "status": "pending",
                            "reason": source_error})
            continue
        if sha256(pdf_temp) != candidate["audited_candidate_pdf_sha256"]:
            lesson_temp.unlink(missing_ok=True)
            pdf_temp.unlink(missing_ok=True)
            pending.append({"code": key[0], "index": key[1], "status": "pending",
                            "reason": "candidate PDF changed while preparing promotion"})
            continue
        lesson_temp.replace(lesson_destination)
        pdf_temp.replace(pdf_destination)
        candidate_checksum = candidate["audited_candidate_pdf_sha256"]
        final_checksum = sha256(pdf_destination)
        if candidate_checksum != final_checksum:
            raise ValueError(f"Promoted PDF checksum differs from accepted candidate: {pdf_destination}")
        final_pdf = pymupdf.open(pdf_destination)
        try:
            if len(final_pdf) != int(candidate["output_pages"]):
                raise ValueError(f"Promoted PDF page count changed: {pdf_destination}")
        finally:
            final_pdf.close()
        promoted.append({
            "code": key[0], "index": key[1],
            "lesson_json": str(lesson_destination.relative_to(ROOT)),
            "output_pdf": str(pdf_destination.relative_to(ROOT)),
            "pdf_sha256": final_checksum,
            "output_pages": candidate["output_pages"],
            "visual_review": "passed",
            "final_checksum_matches_candidate": True,
        })
    manifest["phase"] = "promotion"
    manifest["phase_status"] = "complete" if not pending else "complete-with-pending"
    manifest["promotion"] = {"promoted": promoted, "pending": pending,
                             "promoted_count": len(promoted),
                             "pending_count": len(pending)}
    preserved = manifest.get("preserved_master_audit", {}).get("materials", [])
    delivery = []
    for item in render_audit.get("materials", []):
        key = (item["code"], int(item["index"]))
        entry = entries[key]
        was_promoted = any(
            accepted["code"] == key[0] and accepted["index"] == key[1]
            for accepted in promoted
        )
        visually_accepted, visual_reason = visual_review_status(entry, item)
        delivery.append({
            "code": item["code"], "index": item["index"],
            "lesson": item.get("title"),
            "output_pdf": entry.get("existing_output_pdf") if was_promoted else item.get("candidate_pdf"),
            "output_pages": item.get("output_pages"),
            "fidelity": item.get("status") == "passed",
            "visual_review": "passed" if visually_accepted else visual_reason,
            "delivery_status": "promoted" if was_promoted else "pending",
        })
    for item in preserved:
        delivery.append({
            "code": "PBM", "index": item["index"],
            "lesson": item.get("lesson_json"),
            "output_pdf": item.get("output_pdf"),
            "output_pages": item.get("output_pages"),
            "fidelity": item.get("status") == "passed",
            "visual_review": item.get("visual_review"),
            "delivery_status": "preserved-and-audited" if item.get("status") == "passed" else "failed",
        })
    manifest["final_delivery"] = {
        "total_materials": len(delivery),
        "repaired_materials": len(promoted),
        "preserved_masters": len(preserved),
        "pending_materials": len(pending),
        "materials": sorted(delivery, key=lambda item: (item["code"], item["index"])),
    }
    manifest.setdefault("summary", {})["promoted"] = len(promoted)
    manifest["summary"]["pending_promotion"] = len(pending)
    manifest["summary"]["total_materials_audited"] = len(delivery)
    write_json(MANIFEST_PATH, manifest)
    print(json.dumps(manifest["promotion"], ensure_ascii=False, indent=2))
    return 0 if not pending else 1


def accept_pbm01_visual_review(manifest: dict, reviewed_pages: int) -> int:
    materials = manifest.get("candidate_render_audit", {}).get("materials", [])
    target = next((item for item in materials
                   if item.get("code") == "PBM" and int(item.get("index", 0)) == 1), None)
    if target is None or target.get("status") != "passed":
        raise ValueError("PBM 01 must have a successful candidate render before visual acceptance")
    expected = int(target.get("output_pages", 0))
    if reviewed_pages != expected:
        raise ValueError(f"PBM 01 has {expected} candidate pages; reviewed_pages must match")
    entry = next(entry for entry in manifest["materials"]
                 if entry.get("code") == "PBM" and int(entry.get("index", 0)) == 1)
    candidate_pdf = ROOT / target["candidate_pdf"]
    lesson_json = material_inputs(entry)["lesson"]
    if (not candidate_pdf.is_file() or not lesson_json.is_file()
            or not target.get("audited_candidate_pdf_sha256")
            or not target.get("audited_lesson_sha256")
            or not target.get("audited_source_pdf_sha256")
            or not target.get("audited_source_evidence_sha256")):
        raise ValueError("PBM 01 candidate and audited hashes must exist before visual acceptance")
    if sha256(candidate_pdf) != target["audited_candidate_pdf_sha256"]:
        raise ValueError("PBM 01 candidate PDF changed after its fidelity audit")
    if sha256(lesson_json) != target["audited_lesson_sha256"]:
        raise ValueError("PBM 01 lesson changed after its candidate audit")
    if verify_source_pdf(entry) != target["audited_source_pdf_sha256"]:
        raise ValueError("PBM 01 source PDF changed after its candidate audit")
    if source_evidence_hashes(entry) != target["audited_source_evidence_sha256"]:
        raise ValueError("PBM 01 source evidence changed after its candidate audit")
    source_order_path = material_inputs(entry)["source_order"]
    if (not target.get("audited_source_order_sha256")
            or sha256(source_order_path) != target["audited_source_order_sha256"]):
        raise ValueError("PBM 01 source transcript changed after its candidate audit")
    target["tools_owner_visual_review"] = {
        "status": "passed",
        "pages_reviewed": reviewed_pages,
        "reviewer": "tools-owner",
        "pdf_sha256": target["audited_candidate_pdf_sha256"],
        "lesson_sha256": target["audited_lesson_sha256"],
        "source_order_sha256": target["audited_source_order_sha256"],
        "source_pdf_sha256": target["audited_source_pdf_sha256"],
        "source_evidence_sha256": target["audited_source_evidence_sha256"],
    }
    manifest["phase"] = "candidate-render-review"
    manifest["phase_status"] = "in-progress"
    write_json(MANIFEST_PATH, manifest)
    print(f"PBM 01 visual review recorded for {reviewed_pages} pages.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("preflight", "render-candidates", "accept-pbm01-review", "promote"))
    parser.add_argument("--reviewed-pages", type=int,
                        help="tools-owner PBM 01 candidate pages inspected at readable size")
    args = parser.parse_args()
    if not MANIFEST_PATH.is_file():
        raise FileNotFoundError(f"Missing repair manifest: {MANIFEST_PATH}")
    manifest = read_json(MANIFEST_PATH)
    if args.phase == "preflight":
        return run_preflight(manifest)
    if args.phase == "render-candidates":
        return run_candidates(manifest)
    if args.phase == "accept-pbm01-review":
        if args.reviewed_pages is None:
            raise ValueError("--reviewed-pages is required for PBM 01 visual acceptance")
        return accept_pbm01_visual_review(manifest, args.reviewed_pages)
    return promote_accepted(manifest)


if __name__ == "__main__":
    raise SystemExit(main())
