#!/usr/bin/env python3
"""Render and audit the 30 prepared PTN Pro material PDFs."""
from __future__ import annotations

import json
import re
import shutil
import sys
import unicodedata
from contextlib import redirect_stdout
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "materi/_framework"))
import check_fidelity  # noqa: E402
import inspect_pdf  # noqa: E402
import render  # noqa: E402
import prepare_material_set  # noqa: E402
from prepare_material_set import LBE_RANGES  # noqa: E402

FRAMEWORK = ROOT / "materi/_framework"
LBE_SOURCE = ROOT / "materi/downloaded-from-google-doc/LBE/vecalss_materi_lbe.pdf"
FINAL_DIR = ROOT / "tmp/pdfs/material-final"
CONTACT_DIR = FINAL_DIR / "review-sheets"
MANIFEST_PATH = FINAL_DIR / "manifest.json"
PROOF_SELECTION = (
    ("LBE", 1), ("PBM", 2), ("PBM", 3), ("PBM", 4),
    ("PBM", 5), ("PBM", 6), ("PBM", 9), ("PBM", 13), ("PBM", 15),
)


def slug(value: str) -> str:
    value = re.sub(r"^MATERI\s+\d{2}\s+—\s*", "", value, flags=re.I)
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = value.lower().replace("&", " ")
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def source_pages_for_lbe(index: int) -> list[int]:
    start, end = LBE_RANGES[index - 1]
    return list(range(start, end + 1))


def source_text_for(lesson: dict, code: str, index: int) -> tuple[str, str]:
    source = LBE_SOURCE if code == "LBE" else ROOT / lesson["source"]
    selected = source_pages_for_lbe(index) if code == "LBE" else None
    order = prepare_material_set.require_source_match(source, lesson, selected)
    if order == "content-stream":
        return prepare_material_set.selected_source_text(source, selected), order
    if order == "visual-reading-order":
        return prepare_material_set.selected_source_text(source, selected, sort=True), order
    if order == "table-row-major-visual-reading-order":
        return prepare_material_set.visual_source_text(source, selected), order
    raise ValueError(f"Unsupported source reading order {order!r}: {lesson['source']}")


def fidelity_report(source_text: str, source_order: str, lesson: dict,
                    pdf_path: Path, report_path: Path) -> dict:
    report = {"source": lesson["source"], "output": str(pdf_path),
              "source_text_order": source_order}
    authored = check_fidelity.authored_text(lesson)
    check_fidelity.require_equal(source_text, authored, "source_to_editable_lesson", report)
    if source_order == "table-row-major-visual-reading-order":
        report["source_to_editable_lesson"]["comparison"] = (
            "exact normalized character order after row-major reconstruction of source table cells"
        )
    output = pymupdf.open(pdf_path)
    try:
        if len(output) != len(lesson["pages"]):
            raise ValueError(
                f"Expected one rendered page per logical lesson page: "
                f"{len(output)} rendered, {len(lesson['pages'])} logical"
            )
        rendered_pages = []
        for page_number, (rendered_page, lesson_page) in enumerate(
                zip(output, lesson["pages"]), 1):
            actual = check_fidelity.canonical(rendered_page.get_text(clip=pymupdf.Rect(
                0, 68, rendered_page.rect.width, rendered_page.rect.height - 54)))
            expected_page = check_fidelity.canonical(
                check_fidelity.authored_text({"pages": [lesson_page]}))
            synthetic_headers = [
                check_fidelity.canonical(check_fidelity.authored_text({
                    "pages": [{
                        "title": "",
                        "blocks": [{
                            "type": "table", "headers": block["headers"], "rows": [],
                        }],
                    }],
                }))
                for block in lesson_page["blocks"]
                if block.get("type") == "table" and block.get("synthetic_header")
            ]
            candidates = [actual]
            for header in synthetic_headers:
                next_candidates = []
                for candidate in candidates:
                    start = 0
                    while True:
                        offset = candidate.find(header, start)
                        if offset < 0:
                            break
                        next_candidates.append(
                            candidate[:offset] + candidate[offset + len(header):]
                        )
                        start = offset + 1
                candidates = next_candidates
                if not candidates:
                    raise ValueError(
                        f"Could not locate synthetic continuation header on "
                        f"rendered page {page_number} of {pdf_path}"
                    )
            matches = [candidate for candidate in candidates
                       if check_fidelity.canonical(candidate) == expected_page]
            if len(matches) != 1:
                raise ValueError(
                    f"Rendered text does not match lesson page {page_number} after "
                    f"uniquely accounting for synthetic table headers: {pdf_path}"
                )
            rendered_pages.append(matches[0])
        body = "\n".join(rendered_pages)
        report["output_pages"] = len(output)
    finally:
        output.close()
    check_fidelity.require_equal(authored, body, "editable_lesson_to_rendered_body", report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def page_height_estimates(lesson: dict) -> list[tuple[str, float]]:
    styles = render.styles()
    results = []
    for page in lesson["pages"]:
        total = 0.0
        if page.get("title"):
            from reportlab.platypus import Paragraph
            paragraph = Paragraph(render.rich(page["title"]), styles["title"])
            total += paragraph.wrap(render.WIDTH, render.H)[1] + styles["title"].spaceAfter
        for block in page["blocks"]:
            # Use the paginator's semantic measurement so question KeepTogether
            # wrappers contribute their child height instead of ReportLab's
            # 0xffffff forced-split sentinel.
            total += prepare_material_set.measure(block, styles)
        results.append((page["id"], total))
    return results


def image_files(material_dir: Path) -> list[Path]:
    return sorted(material_dir.glob("page-*.png"), key=lambda p: int(re.search(r"page-(\d+)", p.name).group(1)))


def make_review_sheets(rendered: list[tuple[str, str, Path]], contact_dir: Path) -> int:
    if contact_dir.exists():
        shutil.rmtree(contact_dir)
    contact_dir.mkdir(parents=True, exist_ok=True)
    tiles = []
    for code, label, image_path in rendered:
        image = Image.open(image_path).convert("RGB")
        image.thumbnail((835, 1178), Image.Resampling.LANCZOS)
        tile = Image.new("RGB", (850, 1210), "#E6EAE7")
        tile.paste(image, ((850 - image.width) // 2, 25))
        draw = ImageDraw.Draw(tile)
        draw.text((12, 5), f"{code} {label}", fill="#173C2D")
        tiles.append(tile)
    count = 0
    for start in range(0, len(tiles), 4):
        page_group = tiles[start:start + 4]
        sheet = Image.new("RGB", (1700, 2420), "white")
        for offset, tile in enumerate(page_group):
            sheet.paste(tile, ((offset % 2) * 850, (offset // 2) * 1210))
        target = contact_dir / f"contact-{count + 1:02d}.png"
        sheet.save(target)
        count += 1
    return count


def load_lessons(selection: tuple[tuple[str, int], ...] | None = None) -> list[tuple[str, int, Path, dict, Path]]:
    targets = []
    if selection is None:
        for code in ("LBE", "PBM"):
            json_files = sorted((FRAMEWORK / "examples" / code).glob("*.lesson.json"))
            if len(json_files) != 15:
                raise ValueError(f"Expected 15 {code} lesson JSON files, found {len(json_files)}")
            targets.extend((code, path) for path in json_files)
    else:
        for code, index in selection:
            matches = sorted((FRAMEWORK / "examples" / code).glob(f"{index:02d}-*.lesson.json"))
            if len(matches) != 1:
                raise ValueError(
                    f"Expected one editable source for {code} {index:02d}, found {len(matches)}"
                )
            targets.append((code, matches[0]))

    lessons = []
    for code, json_path in targets:
        lesson = json.loads(json_path.read_text(encoding="utf-8"))
        index = int(json_path.name[:2])
        series = "-berlian" if code == "PBM" else ""
        stem = f"{index:02d}-{slug(lesson['title'])}{series}-ptn-pro"
        lessons.append((code, index, json_path, lesson,
                        ROOT / "output/pdf" / code / f"{stem}.pdf"))
    expected = 30 if selection is None else len(selection)
    if len(lessons) != expected:
        raise ValueError(f"Expected {expected} prepared materials, found {len(lessons)}")
    return lessons


def manifest_entry(code: str, lesson: dict, pdf_path: Path, report_path: Path,
                   report: dict) -> dict:
    pages = sorted({source_page for page in lesson["pages"]
                    for source_page in page.get("source_pages", [])})
    return {
        "subject": lesson["subject"],
        "code": code,
        "lesson": lesson["title"],
        "source": lesson["source"],
        "source_pages": pages,
        "source_page_range": [min(pages), max(pages)] if pages else None,
        "output_pdf": str(pdf_path.relative_to(ROOT)) if pdf_path.is_relative_to(ROOT) else str(pdf_path),
        "fidelity_report": str(report_path.relative_to(ROOT)) if report_path.is_relative_to(ROOT) else str(report_path),
        "output_pages": report["output_pages"],
        "fidelity": {
            "source_to_editable": report["source_to_editable_lesson"]["passed"],
            "editable_to_rendered": report["editable_lesson_to_rendered_body"]["passed"],
            "source_order": report["source_text_order"],
        },
        "visual_review": {"status": "pending", "pages_reviewed": 0},
    }


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def mark_visual_reviewed() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if len(manifest.get("materials", [])) != 30:
        raise ValueError("Only a complete 30-PDF batch can be marked as visually reviewed")
    for entry in manifest["materials"]:
        if not all(entry.get("fidelity", {}).get(key) for key in ("source_to_editable", "editable_to_rendered")):
            raise ValueError(f"Cannot mark an unaudited PDF as visually reviewed: {entry.get('output_pdf')}")
        entry["visual_review"] = {
            "status": "passed",
            "pages_reviewed": entry["output_pages"],
        }
    manifest["visual_review_complete"] = True
    write_json(MANIFEST_PATH, manifest)
    print(f"Marked every page in {len(manifest['materials'])} PDFs as visually reviewed.")


def run_batch(proof: bool = False) -> None:
    render.register_fonts()
    selection = PROOF_SELECTION if proof else None
    lessons = load_lessons(selection)
    if proof:
        destination = ROOT / "tmp/pdfs/material-proofs"
        report_dir = destination / "reports"
        contact_dir = destination / "review-sheets"
    else:
        destination = ROOT / "output/pdf"
        report_dir = FINAL_DIR / "reports"
        contact_dir = CONTACT_DIR

    rendered_pages = []
    FINAL_DIR.mkdir(parents=True, exist_ok=True)
    detail_dir = ROOT / "tmp/pdfs/material-proofs" if proof else FINAL_DIR
    detail_dir.mkdir(parents=True, exist_ok=True)
    details_path = detail_dir / "conversion-details.log"
    manifest_entries = []
    with details_path.open("w", encoding="utf-8") as detail_log:
        with redirect_stdout(detail_log):
            for code, index, json_path, lesson, pdf_path in lessons:
                if proof:
                    pdf_path = destination / code / pdf_path.name
                source_text, order = source_text_for(lesson, code, index)
                for page_id, height in page_height_estimates(lesson):
                    print(f"PAGE ESTIMATE {pdf_path.name} {page_id}: {height:.1f}pt / {render.H - 147:.1f}pt frame")
                preserve_reviewed_master = not proof and code == "PBM" and index in {2, 3}
                if preserve_reviewed_master:
                    if not pdf_path.is_file():
                        raise FileNotFoundError(
                            f"Reviewed PBM {index:02d} PDF master is required: {pdf_path}"
                        )
                else:
                    render.build(lesson, pdf_path)
                audit_dir = (destination / "pages" / code / pdf_path.stem) if proof else (FINAL_DIR / code / pdf_path.stem)
                if audit_dir.exists():
                    shutil.rmtree(audit_dir)
                inspect_pdf.inspect(pdf_path, audit_dir, json_path)
                report_path = (report_dir / f"{pdf_path.stem}-fidelity.json") if proof else pdf_path.with_name(f"{pdf_path.stem}-fidelity.json")
                report = fidelity_report(source_text, order, lesson, pdf_path,
                                         report_path)
                if not report["source_to_editable_lesson"]["passed"] or not report["editable_lesson_to_rendered_body"]["passed"]:
                    raise ValueError(f"Fidelity check failed for {pdf_path}")
                if len(image_files(audit_dir)) != report["output_pages"]:
                    raise ValueError(f"Expected one fresh page preview per PDF page: {pdf_path}")
                manifest_entries.append(manifest_entry(code, lesson, pdf_path, report_path, report))
                for page_no, path in enumerate(image_files(audit_dir), 1):
                    rendered_pages.append((code, f"{index:02d} / {pdf_path.stem.split('-', 1)[1]} p{page_no:02d}", path))
    sheet_count = make_review_sheets(rendered_pages, contact_dir)
    manifest_path = (ROOT / "tmp/pdfs/material-proofs/manifest.json") if proof else MANIFEST_PATH
    manifest = {
        "generated_by": "materi/_framework/batch_material_set.py",
        "batch": "representative-proofs" if proof else "LBE-and-PBM",
        "total_pdfs": len(manifest_entries),
        "total_pages": sum(entry["output_pages"] for entry in manifest_entries),
        "visual_review_complete": False,
        "materials": manifest_entries,
    }
    write_json(manifest_path, manifest)
    print(f"Rendered and audited {len(lessons)} material PDFs and {len(rendered_pages)} pages.")
    print(f"Created {sheet_count} four-page visual review sheets in {contact_dir}.")
    print(f"Machine-readable manifest: {manifest_path}")
    for code, index, _, lesson, pdf_path in lessons:
        output = destination / code / pdf_path.name if proof else pdf_path
        print(f"{code} {index:02d}: {lesson['title']} — {output}")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--proof", action="store_true",
                        help="prepare and validate only LBE 01 and PBM 02, 03, 04, 05, 06, 09, 13, and 15 proof PDFs")
    parser.add_argument("--prepare-only", action="store_true",
                        help="write editable lesson JSON files for the selected set (all 30 unless --proof) and stop")
    parser.add_argument("--mark-visual-reviewed", action="store_true",
                        help="mark all final manifest pages reviewed after manual visual QA")
    args = parser.parse_args()
    if args.mark_visual_reviewed:
        mark_visual_reviewed()
        return
    selection = set(PROOF_SELECTION) if args.proof else None
    prepare_material_set.main(selection=selection, allow_existing_pdf=args.proof)
    if args.prepare_only:
        return
    run_batch(proof=args.proof)


if __name__ == "__main__":
    main()
