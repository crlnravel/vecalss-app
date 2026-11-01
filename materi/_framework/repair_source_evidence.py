#!/usr/bin/env python3
"""Collect read-only source evidence for the LBE/PBM repair set."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
LBE_SOURCE = ROOT / "materi/downloaded-from-google-doc/LBE/vecalss_materi_lbe.pdf"
PBM_DIR = ROOT / "materi/downloaded-from-google-doc/PBM"
OUTPUT_DIRS = {"LBE": ROOT / "output/pdf/LBE", "PBM": ROOT / "output/pdf/PBM"}
EXAMPLES_DIRS = {"LBE": ROOT / "materi/_framework/examples/LBE",
                 "PBM": ROOT / "materi/_framework/examples/PBM"}
REPAIR_ROOT = ROOT / "tmp/pdfs/material-repair"
SOURCE_ROOT = REPAIR_ROOT / "source"
MANIFEST_PATH = REPAIR_ROOT / "manifest.json"
LBE_RANGES = [
    (1, 6), (7, 11), (12, 18), (19, 24), (25, 30), (31, 35),
    (36, 40), (41, 45), (46, 51), (52, 57), (58, 63), (64, 70),
    (71, 77), (78, 83), (84, 88),
]
PBM_REPAIR_INDICES = (1, *range(4, 16))


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")
    temporary.replace(path)


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def numbers(values) -> list[float] | None:
    if values is None:
        return None
    try:
        return [float(value) for value in values]
    except (TypeError, ValueError):
        return None


def source_slug(path: Path) -> str:
    value = path.stem.lower()
    value = re.sub(r"^vecalss_materi_lbe$", "", value)
    value = re.sub(r"^\d{2}\s*-\s*", "", value)
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or path.stem


def existing_path(directory: Path, index: int, suffix: str) -> Path | None:
    matches = sorted(path for path in directory.glob(f"{index:02d}-*.{suffix}")
                     if "-fidelity" not in path.name)
    if suffix == "pdf" and directory.name == "PBM":
        preferred = [path for path in matches if "-berlian-ptn-pro.pdf" in path.name]
        if preferred:
            return preferred[0]
    return matches[0] if matches else None


def span_record(span: dict) -> dict:
    flags = int(span.get("flags", 0))
    font = str(span.get("font", ""))
    lower_font = font.lower()
    return {
        "text": str(span.get("text", "")),
        "bbox_pt": numbers(span.get("bbox")),
        "origin_pt": numbers(span.get("origin")),
        "font": font,
        "size_pt": float(span["size"]) if span.get("size") is not None else None,
        "flags": flags,
        "bold": bool(flags & (1 << 4)) or any(
            name in lower_font for name in ("bold", "semibold", "demi")
        ),
        "italic": bool(flags & (1 << 1)) or any(
            name in lower_font for name in ("italic", "oblique")
        ),
        "color": span.get("color"),
    }


def text_blocks(page) -> list[dict]:
    records = []
    data = page.get_text("dict", sort=False)
    for block_index, block in enumerate(data.get("blocks", [])):
        if block.get("type") != 0:
            continue
        lines = []
        for line_index, line in enumerate(block.get("lines", [])):
            spans = [span_record(span) for span in line.get("spans", [])]
            lines.append({
                "line_index": line_index,
                "bbox_pt": numbers(line.get("bbox")),
                "direction": numbers(line.get("dir")),
                "writing_mode": line.get("wmode"),
                "text": "".join(span["text"] for span in spans),
                "spans": spans,
            })
        records.append({
            "block_index": block_index,
            "bbox_pt": numbers(block.get("bbox")),
            "text": "\n".join(line["text"] for line in lines),
            "lines": lines,
        })
    return records


def table_records(page) -> tuple[list[dict], list[dict]]:
    records = []
    errors = []
    try:
        finder = page.find_tables()
        tables = finder.tables
    except Exception as error:  # Keep page text, spans and image if table detection fails.
        return [], [{"stage": "find_tables", "error": f"{type(error).__name__}: {error}"}]

    for table_index, table in enumerate(tables):
        try:
            extracted = table.extract()
            rows = []
            for row_index, row in enumerate(getattr(table, "rows", [])):
                row_text = extracted[row_index] if row_index < len(extracted) else []
                cells = []
                row_boxes = list(getattr(row, "cells", []))
                for column_index, text in enumerate(row_text):
                    cell_box = row_boxes[column_index] if column_index < len(row_boxes) else None
                    cells.append({
                        "column_index": column_index,
                        "bbox_pt": numbers(cell_box),
                        "text": text,
                    })
                rows.append({
                    "row_index": row_index,
                    "bbox_pt": numbers(getattr(row, "bbox", None)),
                    "cells": cells,
                })
            header = getattr(table, "header", None)
            header_cells = list(getattr(header, "cells", [])) if header else []
            header_names = list(getattr(header, "names", [])) if header else []
            records.append({
                "table_index": table_index,
                "bbox_pt": numbers(getattr(table, "bbox", None)),
                "row_count": getattr(table, "row_count", len(extracted)),
                "column_count": getattr(table, "col_count", max(
                    (len(row) for row in extracted), default=0
                )),
                "header": {
                    "bbox_pt": numbers(getattr(header, "bbox", None)) if header else None,
                    "external": getattr(header, "external", None) if header else None,
                    "names": header_names,
                    "cells": [
                        {"column_index": index, "bbox_pt": numbers(box),
                         "text": header_names[index] if index < len(header_names) else None}
                        for index, box in enumerate(header_cells)
                    ],
                },
                "rows": rows,
            })
        except Exception as error:  # One malformed table must not discard sibling evidence.
            errors.append({
                "stage": "extract_table",
                "table_index": table_index,
                "bbox_pt": numbers(getattr(table, "bbox", None)),
                "error": f"{type(error).__name__}: {error}",
            })
    return records, errors


def material_entries() -> tuple[list[dict], list[str]]:
    entries = []
    inventory_errors = []
    if not LBE_SOURCE.is_file():
        inventory_errors.append(f"Missing LBE source: {LBE_SOURCE}")
    else:
        for index, (start, end) in enumerate(LBE_RANGES, 1):
            output = existing_path(OUTPUT_DIRS["LBE"], index, "pdf")
            lesson = existing_path(EXAMPLES_DIRS["LBE"], index, "json")
            entries.append({
                "code": "LBE", "index": index,
                "lesson": output.stem.split("-", 1)[1] if output else f"lbe-{index:02d}",
                "source_pdf": str(LBE_SOURCE.relative_to(ROOT)),
                "source_page_numbers": list(range(start, end + 1)),
                "canonical_lesson_json": str(lesson.relative_to(ROOT)) if lesson else None,
                "existing_output_pdf": str(output.relative_to(ROOT)) if output else None,
            })

    pbm_sources = []
    if PBM_DIR.is_dir():
        for path in PBM_DIR.glob("*.pdf"):
            match = re.match(r"^(\d{2})\s*-", path.name)
            if match:
                pbm_sources.append((int(match.group(1)), path))
    pbm_sources.sort(key=lambda item: item[0])
    if len(pbm_sources) != 15:
        inventory_errors.append(f"Expected 15 PBM source PDFs, found {len(pbm_sources)}")
    by_index = dict(pbm_sources)
    for index in PBM_REPAIR_INDICES:
        source = by_index.get(index)
        if source is None:
            inventory_errors.append(f"Missing PBM source PDF for lesson {index:02d}")
            continue
        output = existing_path(OUTPUT_DIRS["PBM"], index, "pdf")
        lesson = existing_path(EXAMPLES_DIRS["PBM"], index, "json")
        entries.append({
            "code": "PBM", "index": index,
            "lesson": source_slug(source),
            "source_pdf": str(source.relative_to(ROOT)),
            "source_page_numbers": None,
            "canonical_lesson_json": str(lesson.relative_to(ROOT)) if lesson else None,
            "existing_output_pdf": str(output.relative_to(ROOT)) if output else None,
        })
    return entries, inventory_errors


def collect_material(entry: dict) -> dict:
    source = ROOT / entry["source_pdf"]
    folder = SOURCE_ROOT / entry["code"] / f"{entry['index']:02d}-{entry['lesson']}"
    folder.mkdir(parents=True, exist_ok=True)
    result = dict(entry)
    result.update({
        "evidence_dir": str(folder.relative_to(ROOT)),
        "page_evidence": [],
        "errors": [],
    })
    if not source.is_file():
        result["errors"].append({"stage": "open_source", "error": f"Missing source: {source}"})
        result["source_evidence_status"] = "failed"
        return result

    result["source_sha256"] = checksum(source)
    try:
        document = pymupdf.open(source)
    except Exception as error:
        result["errors"].append({
            "stage": "open_source", "error": f"{type(error).__name__}: {error}"
        })
        result["source_evidence_status"] = "failed"
        return result

    source_pages = entry["source_page_numbers"] or list(range(1, len(document) + 1))
    result["source_page_count"] = len(document)
    result["source_page_range"] = ([min(source_pages), max(source_pages)]
                                    if source_pages else None)
    collected_text = []
    for source_page_number in source_pages:
        page_entry = {
            "source_page_number": source_page_number,
            "errors": [],
        }
        page_path = folder / f"source-page-{source_page_number:03d}.json"
        text_path = folder / f"source-page-{source_page_number:03d}.txt"
        image_path = folder / f"source-page-{source_page_number:03d}.png"
        if source_page_number < 1 or source_page_number > len(document):
            page_entry["errors"].append({
                "stage": "page_index",
                "error": f"Source page {source_page_number} is outside 1..{len(document)}",
            })
            write_json(page_path, {
                "schema": "vecalss.pdf.source-page.v1", **page_entry,
                "source_pdf": entry["source_pdf"],
            })
            result["page_evidence"].append({
                **page_entry, "json": str(page_path.relative_to(ROOT)),
            })
            continue

        page = document[source_page_number - 1]
        page_data = {
            "schema": "vecalss.pdf.source-page.v1",
            "source_pdf": entry["source_pdf"],
            "source_page_number": source_page_number,
            "page_size_pt": [float(page.rect.width), float(page.rect.height)],
        }
        try:
            content_stream_text = page.get_text(sort=False)
            visual_sort_text = page.get_text(sort=True)
            page_data["text"] = {
                "content_stream": content_stream_text,
                "visual_sort": visual_sort_text,
            }
            text_path.write_text(
                "CONTENT STREAM ORDER\n\n" + content_stream_text
                + "\n\nVISUAL SORT ORDER\n\n" + visual_sort_text,
                encoding="utf-8",
            )
            page_entry["text"] = str(text_path.relative_to(ROOT))
            collected_text.append(f"--- SOURCE PAGE {source_page_number} ---\n{content_stream_text}")
        except Exception as error:
            page_entry["errors"].append({
                "stage": "extract_text", "error": f"{type(error).__name__}: {error}"
            })
            page_data["text"] = None

        try:
            page_data["text_blocks"] = text_blocks(page)
        except Exception as error:
            page_entry["errors"].append({
                "stage": "extract_styled_spans", "error": f"{type(error).__name__}: {error}"
            })
            page_data["text_blocks"] = []

        try:
            tables, table_errors = table_records(page)
            page_data["tables"] = tables
            if table_errors:
                page_entry["errors"].extend(table_errors)
        except Exception as error:
            page_entry["errors"].append({
                "stage": "extract_tables", "error": f"{type(error).__name__}: {error}"
            })
            page_data["tables"] = []

        try:
            page.get_pixmap(dpi=180, alpha=False).save(image_path)
            page_data["image"] = {
                "path": str(image_path.relative_to(ROOT)),
                "resolution_dpi": 180,
            }
            page_entry["image"] = str(image_path.relative_to(ROOT))
        except Exception as error:
            page_entry["errors"].append({
                "stage": "render_source_image", "error": f"{type(error).__name__}: {error}"
            })
            page_data["image"] = None

        page_data["errors"] = page_entry["errors"]
        write_json(page_path, page_data)
        page_entry["json"] = str(page_path.relative_to(ROOT))
        page_entry["table_count"] = len(page_data.get("tables", []))
        result["page_evidence"].append(page_entry)
    document.close()

    full_text_path = folder / "source-content-stream.txt"
    full_text_path.write_text("\n\n".join(collected_text), encoding="utf-8")
    result["source_text"] = str(full_text_path.relative_to(ROOT))
    error_count = sum(len(page.get("errors", [])) for page in result["page_evidence"])
    result["source_error_count"] = error_count + len(result["errors"])
    result["table_count"] = sum(page.get("table_count", 0) for page in result["page_evidence"])
    result["source_evidence_status"] = "ready" if result["source_error_count"] == 0 else "partial"
    return result


def main() -> None:
    REPAIR_ROOT.mkdir(parents=True, exist_ok=True)
    entries, inventory_errors = material_entries()
    manifest = {
        "schema": "vecalss.pdf.material-repair.v1",
        "repair_job": "LBE and PBM source evidence, composition, render and audit",
        "phase": "source-evidence",
        "phase_status": "in-progress",
        "tools_owner": "d8a52dc3-906c-4dee-87d3-8fdf8c9a545a",
        "source_evidence_root": str(SOURCE_ROOT.relative_to(ROOT)),
        "preserved_references": [
            "materi/_framework/examples/PBM/02-makna-kata-frasa.lesson.json",
            "output/pdf/PBM/02-makna-kata-frasa-berlian-ptn-pro.pdf",
            "materi/_framework/examples/PBM/03-morfologi-pembentukan-kata.lesson.json",
            "output/pdf/PBM/03-morfologi-pembentukan-kata-berlian-ptn-pro.pdf",
            "output/pdf/PBM/pbm1-vecalss.pdf",
        ],
        "inventory_errors": inventory_errors,
        "materials": [],
    }
    write_json(MANIFEST_PATH, manifest)
    for entry in entries:
        try:
            collected = collect_material(entry)
        except Exception as error:  # Continue with the rest of the repair set.
            collected = dict(entry)
            collected.update({
                "source_evidence_status": "failed",
                "errors": [{"stage": "collect_material",
                            "error": f"{type(error).__name__}: {error}"}],
            })
        manifest["materials"].append(collected)
        write_json(MANIFEST_PATH, manifest)
        print(f"{entry['code']} {entry['index']:02d}: "
              f"{collected.get('source_evidence_status')} "
              f"({len(collected.get('page_evidence', []))} page records, "
              f"{collected.get('source_error_count', len(collected.get('errors', [])))} errors)")

    failed = [item for item in manifest["materials"]
              if item.get("source_evidence_status") != "ready"]
    manifest["phase_status"] = "complete" if not failed and not inventory_errors else "complete-with-errors"
    manifest["summary"] = {
        "materials_requested": len(entries),
        "materials_ready": sum(item.get("source_evidence_status") == "ready"
                               for item in manifest["materials"]),
        "materials_partial_or_failed": len(failed),
        "source_pages_captured": sum(len(item.get("page_evidence", []))
                                      for item in manifest["materials"]),
        "table_extraction_errors": sum(
            1 for item in manifest["materials"]
            for page in item.get("page_evidence", [])
            for error in page.get("errors", [])
            if error.get("stage") in {"find_tables", "extract_table", "extract_tables"}
        ),
    }
    write_json(MANIFEST_PATH, manifest)
    print(json.dumps({"manifest": str(MANIFEST_PATH.relative_to(ROOT)),
                      "phase_status": manifest["phase_status"],
                      "summary": manifest["summary"],
                      "inventory_errors": inventory_errors}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
