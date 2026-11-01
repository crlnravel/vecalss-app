#!/usr/bin/env python3
"""Prepare editable per-material lesson sources for the PTN Pro renderer."""
from __future__ import annotations

import copy
import json
import re
import sys
import unicodedata
from io import BytesIO
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "materi/_framework"))
import check_fidelity  # noqa: E402
import render  # noqa: E402

FRAMEWORK = ROOT / "materi/_framework"
PBM_DIR = ROOT / "materi/downloaded-from-google-doc/PBM"
LBE_SOURCE = ROOT / "materi/downloaded-from-google-doc/LBE/vecalss_materi_lbe.pdf"
LBE_MASTER = FRAMEWORK / "examples/lbe-15-materi.lesson.json"
PBM01_MASTER = FRAMEWORK / "examples/01-ejaan-tanda-baca.lesson.json"
PBM02_MASTER = FRAMEWORK / "examples/PBM/02-makna-kata-frasa.lesson.json"
PBM03_MASTER = FRAMEWORK / "examples/PBM/03-morfologi-pembentukan-kata.lesson.json"
LBE_RANGES = [(1, 6), (7, 11), (12, 18), (19, 24), (25, 30), (31, 35),
              (36, 40), (41, 45), (46, 51), (52, 57), (58, 63), (64, 70),
              (71, 77), (78, 83), (84, 88)]
TABLE_CONTINUATION_PAIRS = {
    "02 - Makna Kata & Frasa.pdf": {(3, 4)},
    "03 - Morfologi & Pembentukan Kata.pdf": {(5, 6), (6, 7)},
    "04 - Semantik: Makna & Relasi Makna.pdf": {(1, 2), (3, 4), (4, 5)},
    "05 - Pilihan Kata & Diksi yang Tepat.pdf": {(9, 10), (10, 11)},
    "06 - Sintaksis: Fungsi & Struktur Kalimat.pdf": {(5, 6)},
    "13 - Jenis Teks & Sikap Penulis.pdf": {(7, 8)},
    "15 - Simpulan dan Inferensi Teks.pdf": {(2, 3)},
}
TABLE_CONTINUED_CELL_ROWS = {
    "05 - Pilihan Kata & Diksi yang Tepat.pdf": {(10, 11)},
}
TABLE_CONTINUATION_COLUMN_MAPPINGS = {
    ("04 - Semantik: Makna & Relasi Makna.pdf", 3, 4):
        ("Istilah", "Definisi", "Contoh"),
    ("04 - Semantik: Makna & Relasi Makna.pdf", 4, 5):
        ("Jenis Perubahan", "Definisi", "Contoh"),
    ("05 - Pilihan Kata & Diksi yang Tepat.pdf", 9, 10):
        ("Pasangan Kata", "Aturan Pakai", "Contoh"),
    ("05 - Pilihan Kata & Diksi yang Tepat.pdf", 10, 11):
        ("Pasangan Kata", "Aturan Pakai", "Contoh"),
}
CONTROL_RE = re.compile(r"[\u200b\ufeff\ufe0f]")
TABLE_BULLET_RE = re.compile(r"^([●•■])\s*(.*)$")
MATERIAL_RE = re.compile(r"^(MATERI\s+\d{2}\s+—\s+.+?)(?=\s+Subtes:|$)")
SPECIAL_RE = re.compile(r"^(?:💡\s*Veco\s+Tips|⚠️?\s*Kesalahan Umum)", re.I)
SECTION_RE = re.compile(r"^(?:[A-Z]\.|[A-Z]\d+\.|[A-Z]\d+[.)])\s+")
QUESTION_RE = re.compile(r"^(\d+)([.)])\s+(.+)$", re.S)
OPTION_RE = re.compile(r"^([A-Ea-e])([.)])\s+(.+)$", re.S)
NUMBERED_RE = re.compile(r"^(\d+)([.)])\s+(.*)$")


def clean(value: str) -> str:
    return " ".join(CONTROL_RE.sub("", value).split())


def span_markup(span: dict) -> str:
    """Represent source bold and italic spans as editable inline markup."""
    text = CONTROL_RE.sub("", span.get("text", ""))
    if not text:
        return ""
    flags = int(span.get("flags", 0))
    font = str(span.get("font", "")).lower()
    bold = bool(flags & (1 << 4)) or any(word in font for word in ("bold", "semibold", "demi"))
    italic = bool(flags & (1 << 1)) or "italic" in font or "oblique" in font
    if bold and italic:
        return f"***{text}***"
    if bold:
        return f"**{text}**"
    if italic:
        return f"*{text}*"
    return text


def text_block_details(block: dict) -> tuple[str, float, float]:
    """Return styled line text, median font size, and maximum font size."""
    lines = []
    sizes = []
    for line in block.get("lines", []):
        spans = line.get("spans", [])
        parts = []
        previous_right = None
        previous_text = ""
        for span in spans:
            text = CONTROL_RE.sub("", span.get("text", ""))
            if not text:
                continue
            x0 = float(span.get("bbox", (0, 0, 0, 0))[0])
            if (parts and previous_right is not None
                    and x0 - previous_right > 0.8
                    and not previous_text.endswith((" ", "\t"))
                    and not text.startswith((" ", "\t"))):
                parts.append(" ")
            parts.append(span_markup(span))
            previous_right = float(span.get("bbox", (0, 0, 0, 0))[2])
            previous_text = text
            sizes.append(float(span.get("size", 0)))
        lines.append("".join(parts))
    ordered_sizes = sorted(size for size in sizes if size > 0)
    median = ordered_sizes[len(ordered_sizes) // 2] if ordered_sizes else 0.0
    maximum = max(ordered_sizes, default=0.0)
    return "\n".join(lines), median, maximum


def plain_text(value: str) -> str:
    return re.sub(r"\*{1,3}", "", value)


def markup_character_stream(value: str) -> tuple[str, list[tuple[bool, bool]]]:
    """Expose visible characters and their emphasis without losing raw offsets."""
    characters: list[str] = []
    styles: list[tuple[bool, bool]] = []
    stack: list[str] = []
    marker_width = {"b": 2, "i": 1}
    index = 0
    while index < len(value):
        if value[index] != "*":
            characters.append(value[index])
            styles.append(("b" in stack, "i" in stack))
            index += 1
            continue
        end = index
        while end < len(value) and value[end] == "*":
            end += 1
        remaining = end - index
        while stack and remaining >= marker_width[stack[-1]]:
            remaining -= marker_width[stack.pop()]
        if remaining == 1:
            stack.append("i")
        elif remaining == 2:
            stack.append("b")
        elif remaining == 3:
            stack.extend(("b", "i"))
        elif remaining:
            raise ValueError("Cannot safely split unsupported emphasis markup")
        index = end
    if stack:
        raise ValueError("Cannot safely split unbalanced source emphasis markup")
    visible = "".join(characters)
    if visible != plain_text(value):
        raise ValueError("Emphasis stream does not match visible source text")
    return visible, styles


def styled_markup(value: str, styles: list[tuple[bool, bool]]) -> str:
    """Rebuild balanced inline markup for a visible string and its source styles."""
    if len(value) != len(styles):
        raise ValueError("Visible text and emphasis map have different lengths")
    parts: list[str] = []
    run_style = None
    run_text: list[str] = []

    def flush() -> None:
        if not run_text:
            return
        text = "".join(run_text)
        if run_style == (True, True):
            parts.append(f"***{text}***")
        elif run_style == (True, False):
            parts.append(f"**{text}**")
        elif run_style == (False, True):
            parts.append(f"*{text}*")
        else:
            parts.append(text)

    for character, style in zip(value, styles):
        if run_style is not None and style != run_style:
            flush()
            run_text.clear()
        run_style = style
        run_text.append(character)
    flush()
    return "".join(parts)


def split_styled_match(value: str, pattern: re.Pattern) -> tuple[str, str] | None:
    """Split a label/body pair on visible regex groups while retaining both styles."""
    visible, styles = markup_character_stream(value)
    leading = len(visible) - len(visible.lstrip())
    trailing = len(visible.rstrip())
    visible, styles = visible[leading:trailing], styles[leading:trailing]
    match = pattern.match(visible)
    if not match or match.lastindex is None or match.lastindex < 3:
        return None
    label_start, label_end = match.start(1), match.end(2)
    body_start, body_end = match.span(3)
    return (
        styled_markup(visible[label_start:label_end], styles[label_start:label_end]),
        styled_markup(visible[body_start:body_end], styles[body_start:body_end]),
    )


def slug(value: str) -> str:
    value = re.sub(r"^MATERI\s+\d{2}\s+—\s*", "", value, flags=re.I)
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = value.lower().replace("&", " ")
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def selected_source_text(source: Path, page_numbers: list[int] | None = None,
                         sort: bool = False) -> str:
    doc = pymupdf.open(source)
    try:
        pages = range(len(doc)) if page_numbers is None else [n - 1 for n in page_numbers]
        return "\n".join(doc[n].get_text(sort=sort) for n in pages)
    finally:
        doc.close()


def source_style_stream(page, sort: bool = False) -> tuple[str, list[tuple[bool, bool]]]:
    """Extract normalized page text with a parallel bold/italic map."""
    characters: list[tuple[str, tuple[bool, bool]]] = []
    data = page.get_text("dict", sort=sort)
    for block in data["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            previous_right = None
            previous_text = ""
            for span in line.get("spans", []):
                text = CONTROL_RE.sub("", span.get("text", ""))
                x0 = float(span.get("bbox", (0, 0, 0, 0))[0])
                if (characters and previous_right is not None
                        and x0 - previous_right > 0.8
                        and not previous_text.endswith((" ", "\t"))
                        and not text.startswith((" ", "\t"))):
                    characters.append((" ", (False, False)))
                flags = int(span.get("flags", 0))
                font = str(span.get("font", "")).lower()
                bold = bool(flags & (1 << 4)) or any(word in font for word in ("bold", "semibold", "demi"))
                italic = bool(flags & (1 << 1)) or "italic" in font or "oblique" in font
                characters.extend((char, (bold, italic)) for char in text)
                previous_right = float(span.get("bbox", (0, 0, 0, 0))[2])
                previous_text = text
            characters.append((" ", (False, False)))

    normalized: list[str] = []
    styles: list[tuple[bool, bool]] = []
    for character, style in characters:
        if character in "\u200b\ufeff\ufe0f":
            continue
        if character.isspace():
            if normalized and normalized[-1] != " ":
                normalized.append(" ")
                styles.append((False, False))
            continue
        normalized.append(character)
        styles.append(style)
    while normalized and normalized[-1] == " ":
        normalized.pop()
        styles.pop()
    while normalized and normalized[0] == " ":
        normalized.pop(0)
        styles.pop(0)
    return "".join(normalized), styles


def with_source_emphasis(value: str, source_text: str,
                         source_styles: list[tuple[bool, bool]], cursor: int) -> tuple[str, int]:
    plain = check_fidelity.canonical(plain_text(value))
    if not plain:
        return value, cursor
    start = source_text.find(plain, cursor)
    if start < 0:
        raise ValueError(f"Could not align lesson text with source spans: {plain[:90]!r}")
    styles = source_styles[start:start + len(plain)]
    if len(styles) != len(plain):
        raise ValueError("Source emphasis map ended before the matching lesson text")
    parts = []
    run_style = None
    run_text = []

    def flush():
        if not run_text:
            return
        text = "".join(run_text)
        if run_style == (True, True):
            parts.append(f"***{text}***")
        elif run_style == (True, False):
            parts.append(f"**{text}**")
        elif run_style == (False, True):
            parts.append(f"*{text}*")
        else:
            parts.append(text)

    for character, style in zip(plain, styles):
        if run_style is not None and style != run_style:
            flush()
            run_text.clear()
        run_style = style
        run_text.append(character)
    flush()
    return "".join(parts), start + len(plain)


def apply_page_emphasis(lesson_page: dict, source_page) -> None:
    expected = check_fidelity.authored_text({"pages": [lesson_page]})
    source_text, source_styles = source_style_stream(source_page)
    if source_text != check_fidelity.canonical(expected):
        source_text, source_styles = source_style_stream(source_page, sort=True)
    if source_text != check_fidelity.canonical(expected):
        raise ValueError(f"Could not align LBE source emphasis on page {source_page.number + 1}")
    cursor = 0

    def decorate(container: dict, key: str) -> None:
        nonlocal cursor
        if container.get(key):
            container[key], cursor = with_source_emphasis(
                container[key], source_text, source_styles, cursor
            )

    if lesson_page.get("title"):
        lesson_page["title"], cursor = with_source_emphasis(
            lesson_page["title"], source_text, source_styles, cursor
        )
    for block in lesson_page.get("blocks", []):
        kind = block["type"]
        if kind in ("paragraph", "heading"):
            decorate(block, "text")
        elif kind == "tip":
            decorate(block, "title")
            decorate(block, "text")
            for index, value in enumerate(block.get("items", [])):
                block["items"][index], cursor = with_source_emphasis(
                    value, source_text, source_styles, cursor
                )
        elif kind == "table":
            for index, value in enumerate(block["headers"]):
                block["headers"][index], cursor = with_source_emphasis(
                    value, source_text, source_styles, cursor
                )
            for row in block["rows"]:
                for index, value in enumerate(row):
                    row[index], cursor = with_source_emphasis(value, source_text, source_styles, cursor)
        elif kind == "steps":
            labels = block.get("item_labels")
            if labels is None:
                start = block.get("start", 1)
                labels = [f"{number}." for number in range(start, start + len(block["items"]))]
            if len(labels) != len(block["items"]):
                raise ValueError("Numbered-step labels do not match their item count")
            # Authored source order alternates each marker and its body.
            # Decorating all markers first moves the emphasis cursor past the
            # intervening text and can assign source styles to the wrong spans.
            for index, (label, value) in enumerate(zip(labels, block["items"])):
                labels[index], cursor = with_source_emphasis(
                    label, source_text, source_styles, cursor
                )
                block["items"][index], cursor = with_source_emphasis(
                    value, source_text, source_styles, cursor
                )
            block["item_labels"] = labels
        elif kind == "bullets":
            for index, value in enumerate(block["items"]):
                block["items"][index], cursor = with_source_emphasis(
                    value, source_text, source_styles, cursor
                )
        elif kind == "question":
            question_label = block.get(
                "question_label", block["id"] + block.get("id_separator", ".")
            )
            block["question_label"], cursor = with_source_emphasis(
                question_label, source_text, source_styles, cursor
            )
            decorate(block, "prompt")
            option_labels = block.get("option_labels")
            if option_labels is None:
                label_separator = block.get("label_separator", ".")
                option_labels = [label + label_separator
                                 for label in block.get("labels", "ABCDE")]
            if len(option_labels) != len(block["options"]):
                raise ValueError("Answer-option labels do not match their option count")
            for index, label in enumerate(option_labels):
                option_labels[index], cursor = with_source_emphasis(
                    label, source_text, source_styles, cursor
                )
                block["options"][index], cursor = with_source_emphasis(
                    block["options"][index], source_text, source_styles, cursor
                )
            block["option_labels"] = option_labels
        elif kind == "references":
            for item in block["items"]:
                item["label"], cursor = with_source_emphasis(
                    item["label"], source_text, source_styles, cursor
                )


def source_tables(page, source_name: str, page_number: int) -> list[tuple[tuple[float, float, float, float], dict]]:
    tables = table_rows(page, source_name, page_number)
    if source_name == "09 - Konjungsi dan Hubungan Logis.pdf" and page_number == 2:
        # The narrow cells visibly wrap complete words internally (for example
        # “Konjung|si” and “penamba|han”). Reconstruct the inspected cells as
        # whole words instead of preserving extraction-created spaces.
        found = page.search_for("Kamu ingin teh")
        raw_tables = page.find_tables().tables
        target = next((table for table in raw_tables
                       if found and pymupdf.Rect(table.bbox).intersects(found[0])), None)
        if target is None:
            raise ValueError("Could not locate PBM 09 page 2's wrapped-cell table")
        bbox = tuple(float(value) for value in target.bbox)
        tables = [(table_bbox, block) for table_bbox, block in tables
                  if not overlaps_table(table_bbox, bbox)]
        tables.append((bbox, {
            "type": "table",
            # The two examples in this cell are separate source bullets, not
            # extraction wraps. Preserve their visible separation explicitly.
            "preserve_line_breaks": True,
            "headers": ["**Fungsi**", "**Konjungsi**", "**Contoh**"],
            "rows": [
                ["a. Penanda hubungan penambahan", "dan", "Rina sedang membaca dan menulis."],
                ["b. Penanda hubungan pemilihan", "atau", "Kamu ingin teh atau kopi?"],
                ["c. Penanda hubungan pertentangan", "melainkan, tetapi, sedangkan, padahal",
                 "- Ia rajin, tetapi kurang teliti.\n- Ia sengaja melewatkan latihan karate, padahal lawannya bukan orang biasa."],
                ["d. Penanda hubungan waktu", "lalu, kemudian",
                 "Anika menyalami kedua orang tuanya, lalu bergegas pergi ke sekolah."],
            ],
            "widths": [1, 1, 2.2],
        }))
    if source_name == "02 - Makna Kata & Frasa.pdf" and page_number == 6:
        # This one-row comparison table has no internal horizontal rule, so
        # geometric extraction splits the second cell into a false extra row.
        found = page.search_for("Salah hitung")
        raw_tables = page.find_tables().tables
        target = next((table for table in raw_tables
                       if found and pymupdf.Rect(table.bbox).intersects(found[0])), None)
        if target is None:
            raise ValueError("Could not locate PBM 02 page 6's comparison table")
        bbox = tuple(float(v) for v in target.bbox)
        tables = [(table_bbox, block) for table_bbox, block in tables
                  if not overlaps_table(table_bbox, bbox)]
        tables.append((bbox, {
            "type": "table", "headers": ["", ""],
            "rows": [[
                "Salah hitung jumlah kata minimal",
                "Kata berimbuhan kompleks (\"keberhasilannya\") tetap satu kata, bukan frasa.",
            ]],
            "widths": [1, 1],
        }))
    if source_name == "05 - Pilihan Kata & Diksi yang Tepat.pdf" and page_number == 3:
        # This wrapped comparison cell puts “seharusnya” at the start of its
        # second visual line, before “Rombongan guru...”. Text extraction from
        # the cell groups the phrase at the end, so restore the visible line
        # order and let the exact row-major fidelity check verify it.
        rows = [row for _, block in tables for row in block.get("rows", [])
                if len(row) == 2 and plain_text(row[0]).strip() == "Tidak tepat"
                and "Kawanan guru" in plain_text(row[1])]
        if len(rows) != 1:
            raise ValueError("Could not uniquely locate PBM 05 page 3's wrapped comparison row")
        row = rows[0]
        arrow_index = row[1].rfind("→")
        tail = row[1][arrow_index + 1:] if arrow_index >= 0 else ""
        tail_text = plain_text(tail).strip()
        if tail_text == "Rombongan guru... seharusnya":
            corrected_tail = re.sub(r"\s*seharusnya\s*$", "", tail).strip()
            row[1] = row[1][:arrow_index + 1] + " seharusnya " + corrected_tail
        elif tail_text != "seharusnya Rombongan guru...":
            raise ValueError(f"Unexpected PBM 05 visual table text order: {plain_text(row[1])!r}")
    if source_name == "05 - Pilihan Kata & Diksi yang Tepat.pdf" and page_number == 11:
        # Page 10–11 split one logical comparison row. The page image reads
        # the full second-cell continuation before the full third-cell
        # continuation, while PDF extraction interleaves them line by line.
        # Reconstruct those visible cells explicitly; require_source_match
        # still checks exact normalized character order. Preserve source
        # emphasis: only “SEBAGIAN” is bold and the third cell is italic.
        found = page.search_for("SEBAGIAN")
        raw_tables = page.find_tables().tables
        target = next((table for table in raw_tables
                       if found and pymupdf.Rect(table.bbox).intersects(found[0])), None)
        if target is None:
            raise ValueError("Could not locate PBM 05 page 11's split table row")
        bbox = tuple(float(value) for value in target.bbox)
        tables = [(table_bbox, block) for table_bbox, block in tables
                  if not overlaps_table(table_bbox, bbox)]
        tables.append((bbox, {
            "type": "table", "headers": ["", "", ""],
            "rows": [[
                "", "**SEBAGIAN** dari jumlah yang lebih banyak.",
                "*persediaan yang menipis dan kenaikan harga BBM.*",
            ]],
            "widths": [1, 1, 1],
        }))
    # Preserve table geometry and source-page provenance for strict reading
    # order reconstruction and adjacent-page continuation matching.
    for bbox, block in tables:
        if block.get("type") == "table":
            block["_source_bbox"] = bbox
            block["_source_pages"] = [page_number]
            block["_header_source_pages"] = (
                [page_number] if any(block.get("headers", [])) else []
            )
            block["_row_source_pages"] = [
                [page_number] for _ in block.get("rows", [])
            ]
            if "_column_edges" not in block:
                block["_column_edges"] = source_column_edges(page, bbox)
    return tables


def table_fragment_rows(block: dict) -> list[list[str]]:
    header = block.get("headers", [])
    rows = ([header] if header and any(header) else []) + list(block.get("rows", []))
    return rows


def merge_source_table_continuations(
        pages: list[list[tuple[float, float, str, object, tuple[float, float, float, float]]]],
        page_numbers: list[int], page_height: float, source_name: str) -> None:
    """Join visually confirmed, same-grid table continuations across page edges."""
    edge_zone = page_height * 0.18
    open_block = None
    open_bbox = None
    open_page = None

    def same_grid(left: dict, right: dict, left_page: int, right_page: int) -> bool:
        left_edges = left.get("_column_edges", [])
        right_edges = right.get("_column_edges", [])
        if (len(left_edges) < 3 or len(left_edges) != len(right_edges)
                or abs(float(left_edges[0]) - float(right_edges[0])) > 2.0
                or abs(float(left_edges[-1]) - float(right_edges[-1])) > 2.0):
            return False
        mapped_columns = TABLE_CONTINUATION_COLUMN_MAPPINGS.get(
            (source_name, left_page, right_page)
        )
        if mapped_columns:
            left_header = tuple(clean(plain_text(cell)) for cell in left.get("headers", []))
            right_header = tuple(clean(plain_text(cell)) for cell in right.get("headers", []))
            return (
                len(mapped_columns) == len(left_edges) - 1
                and left_header == mapped_columns
                and (not any(right_header) or right_header == mapped_columns)
            )
        # The reviewed source previews are 857px wide for a 595pt page, so an
        # absolute 2pt PDF-coordinate tolerance is about three pixels. It allows
        # small raster/extraction rounding while failing materially shifted
        # dividers. Known reflow pairs above use explicit, header-labeled maps.
        return all(abs(float(left_edge) - float(right_edge)) <= 2.0
                   for left_edge, right_edge in zip(left_edges[1:-1], right_edges[1:-1]))

    def repeated_header(left: dict, right: dict) -> bool:
        left_header = left.get("headers", [])
        right_header = right.get("headers", [])
        if right_header and not any(right_header):
            rows = right.get("rows", [])
            right_header = rows[0] if rows else right_header
        return (bool(left_header) and bool(right_header)
                and any(left_header) and any(right_header)
                and check_fidelity.canonical(plain_text(" ".join(left_header)))
                == check_fidelity.canonical(plain_text(" ".join(right_header))))

    def append_fragment(left: dict, right: dict, right_page: int) -> None:
        left_rows = left.setdefault("rows", [])
        fragment_rows = table_fragment_rows(right)
        left_row_sources = left.setdefault("_row_source_pages", [
            list(left.get("_source_pages", [open_page])) for _ in left_rows
        ])
        fragment_row_sources = [list(pages) for pages in right.get(
            "_row_source_pages", [right.get("_source_pages", [right_page])
                                  for _ in right.get("rows", [])]
        )]
        if right.get("headers") and any(right["headers"]):
            fragment_row_sources.insert(
                0, list(right.get("_header_source_pages", [right_page]))
            )
        if len(left_row_sources) != len(left_rows) or len(fragment_row_sources) != len(fragment_rows):
            raise ValueError(
                f"Table-row provenance does not match cells at "
                f"{source_name} page {right_page}"
            )
        joins_continued_cell = (
            (open_page, right_page)
            in TABLE_CONTINUED_CELL_ROWS.get(source_name, set())
        )
        if joins_continued_cell:
            if (not fragment_rows or fragment_rows[0][0].strip()
                    or not any(cell.strip() for cell in fragment_rows[0][1:])):
                raise ValueError(
                    f"Expected a blank-first-cell row continuation at "
                    f"{source_name} pages {open_page}–{right_page}"
                )
            if not left_rows:
                raise ValueError("A continued source-table cell has no preceding row")
            previous = left_rows[-1]
            continuation = fragment_rows.pop(0)
            continuation_sources = fragment_row_sources.pop(0)
            if len(previous) != len(continuation):
                raise ValueError("A continued source-table row changed its column count")
            for column, fragment in enumerate(continuation):
                if fragment:
                    previous[column] = (previous[column].rstrip() + " " + fragment.lstrip()).strip()
            left_row_sources[-1] = sorted(set(left_row_sources[-1]) | set(continuation_sources))
        left_rows.extend(fragment_rows)
        left_row_sources.extend(fragment_row_sources)
        left["_source_pages"] = sorted(set(left.get("_source_pages", []))
                                       | set(right.get("_source_pages", [right_page])))

    for page_number, events in zip(page_numbers, pages):
        merged_from_previous = False
        confirmed_pair = (page_number - 1, page_number) in TABLE_CONTINUATION_PAIRS.get(source_name, set())
        if confirmed_pair:
            if (open_block is None or open_bbox is None or open_page != page_number - 1
                    or not events or events[0][2] != "table"):
                raise ValueError(
                    f"Could not locate both page-edge table fragments at "
                    f"{source_name} pages {page_number - 1}–{page_number}"
                )
            _, _, _, current_block, current_bbox = events[0]
            starts_at_top = current_bbox[1] <= edge_zone
            previous_reaches_bottom = open_bbox[3] >= page_height - edge_zone
            if not starts_at_top or not previous_reaches_bottom:
                raise ValueError(
                    f"Expected table continuation at {source_name} pages "
                    f"{open_page}–{page_number}, but the fragments do not meet page edges"
                )
            if not same_grid(open_block, current_block, open_page, page_number):
                raise ValueError(
                    f"Table continuation grid changed at {source_name} pages "
                    f"{open_page}–{page_number}; inspect source geometry before conversion"
                )
            if not repeated_header(open_block, current_block):
                append_fragment(open_block, current_block, page_number)
                open_bbox = current_bbox
                open_page = page_number
                events.pop(0)
                merged_from_previous = True

        if events:
            last = events[-1]
            if last[2] == "table" and last[4][3] >= page_height - edge_zone:
                open_block, open_bbox, open_page = last[3], last[4], page_number
            else:
                open_block = open_bbox = open_page = None
        elif not merged_from_previous:
            open_block = open_bbox = open_page = None


def source_table_text(block: dict) -> str:
    return " ".join(plain_text(value) for row in [block["headers"], *block["rows"]]
                    for value in row if value)


def visual_source_text(source: Path, page_numbers: list[int] | None = None) -> str:
    """Reconstruct source order from visual table cells and adjacent page fragments."""
    doc = pymupdf.open(source)
    try:
        selected = list(range(len(doc))) if page_numbers is None else [n - 1 for n in page_numbers]
        selected_numbers = [page_index + 1 for page_index in selected]
        pages = []
        for page_index in selected:
            page = doc[page_index]
            tables = source_tables(page, source.name, page_index + 1)
            events = [(bbox[1], bbox[0], "table", block, bbox)
                      for bbox, block in tables if block.get("type") == "table"]
            for block in page.get_text("blocks"):
                if len(block) > 6 and block[6] != 0:
                    continue
                bbox = tuple(float(value) for value in block[:4])
                if any(overlaps_table(bbox, table_bbox) for table_bbox, _ in tables):
                    continue
                text = clean(block[4])
                if text:
                    events.append((bbox[1], bbox[0], "text", text, bbox))
            events.sort(key=lambda event: (round(event[0], 1), round(event[1], 1),
                                           0 if event[2] == "table" else 1))
            pages.append(events)
        merge_source_table_continuations(
            pages, selected_numbers, float(doc[0].rect.height), source.name
        )
        ordered = []
        for page_events in pages:
            for _, _, kind, content, _ in page_events:
                text = source_table_text(content) if kind == "table" else str(content)
                if text:
                    ordered.append(text)
        return "\n".join(ordered)
    finally:
        doc.close()


def require_source_match(source: Path, lesson: dict,
                         page_numbers: list[int] | None = None) -> str:
    authored = check_fidelity.authored_text(lesson)
    default = selected_source_text(source, page_numbers, sort=False)
    if check_fidelity.canonical(default) == check_fidelity.canonical(authored):
        return "content-stream"
    sorted_text = selected_source_text(source, page_numbers, sort=True)
    if check_fidelity.canonical(sorted_text) == check_fidelity.canonical(authored):
        return "visual-reading-order"
    reconstructed = visual_source_text(source, page_numbers)
    if check_fidelity.canonical(reconstructed) == check_fidelity.canonical(authored):
        return "table-row-major-visual-reading-order"
    a, b = check_fidelity.canonical(default), check_fidelity.canonical(authored)
    first = next((i for i, (x, y) in enumerate(zip(a, b)) if x != y), min(len(a), len(b)))
    raise ValueError(
        f"Source/editable text mismatch for {source}: "
        f"source={a[max(0, first-70):first+150]!r}; "
        f"editable={b[max(0, first-70):first+150]!r}"
    )


def lbe_lessons(selection: set[tuple[str, int]] | None = None) -> list[tuple[dict, Path, str]]:
    selected_indices = ({index for code, index in selection if code == "LBE"}
                        if selection is not None else None)
    if selected_indices == set():
        return []
    selected_source_pages = ({page for index in selected_indices
                              for page in range(LBE_RANGES[index - 1][0],
                                                LBE_RANGES[index - 1][1] + 1)}
                             if selected_indices is not None else None)
    master = json.loads(LBE_MASTER.read_text(encoding="utf-8"))
    source_doc = pymupdf.open(LBE_SOURCE)
    try:
        if len(source_doc) != 88 or len(master["pages"]) != 88:
            raise ValueError("The LBE source and editable master must both contain 88 pages")
        for page in master["pages"]:
            source_pages = page.get("source_pages", [])
            if len(source_pages) != 1:
                raise ValueError(f"Expected one source page per LBE master page, got {source_pages}")
            if (selected_source_pages is not None
                    and source_pages[0] not in selected_source_pages):
                continue
            apply_page_emphasis(page, source_doc[source_pages[0] - 1])
    finally:
        source_doc.close()
    output = []
    for index, (start, end) in enumerate(LBE_RANGES, 1):
        if selected_indices is not None and index not in selected_indices:
            continue
        page_numbers = list(range(start, end + 1))
        pages = [page for page in master["pages"]
                 if any(n in page.get("source_pages", []) for n in page_numbers)]
        mapped = sorted({n for page in pages for n in page.get("source_pages", [])})
        if mapped != page_numbers:
            raise ValueError(f"LBE material {index:02d}: expected source pages {page_numbers}, mapped {mapped}")
        title = next((page["title"] for page in pages if page["title"]), "")
        if not title:
            raise ValueError(f"LBE material {index:02d}: missing source title")
        lesson = copy.deepcopy(master)
        lesson["title"] = title
        lesson["pages"] = paginate(lbe_entries(pages), "", index)
        lesson["source"] = "materi/downloaded-from-google-doc/LBE/vecalss_materi_lbe.pdf"
        require_source_match(LBE_SOURCE, lesson, page_numbers)
        path = FRAMEWORK / "examples/LBE" / f"{index:02d}-{slug(title)}.lesson.json"
        output.append((lesson, path, "LBE"))
    return output


def cluster_coordinates(values: list[float], tolerance: float = 1.0) -> list[float]:
    groups = []
    for value in sorted(values):
        if not groups or value - groups[-1][-1] > tolerance:
            groups.append([value])
        else:
            groups[-1].append(value)
    return [sum(group) / len(group) for group in groups]


def source_column_edges(page, bbox: tuple[float, float, float, float]) -> list[float]:
    target = next((table for table in page.find_tables().tables
                   if all(abs(float(actual) - expected) <= 1.0
                          for actual, expected in zip(table.bbox, bbox))), None)
    if target is None:
        raise ValueError(f"Could not resolve source-table columns for {bbox}")
    cells = [cell for cell in target.cells if cell is not None]
    return cluster_coordinates([float(value) for cell in cells
                               for value in (cell[0], cell[2])])


def table_rows(page, source_name: str = "", page_number: int | None = None) -> list[tuple[tuple[float, float, float, float], dict]]:
    result = []
    page_spans = [(float(line["bbox"][1]), span)
                  for block in page.get_text("dict")["blocks"]
                  if block.get("type") == 0
                  for line in block.get("lines", [])
                  for span in line.get("spans", [])]
    drawings = page.get_drawings()
    for table in page.find_tables().tables:
        bbox = tuple(float(v) for v in table.bbox)
        cells = [cell for cell in table.cells if cell is not None]
        x_lines = cluster_coordinates([float(v) for cell in cells for v in (cell[0], cell[2])])

        # Use drawn horizontal rules as the logical row boundaries. Table.find_tables
        # may treat each wrapped text line as its own row even when no rule divides it.
        segments = []
        for drawing in drawings:
            for item in drawing["items"]:
                if item[0] == "l":
                    p0, p1 = item[1], item[2]
                    if abs(p0.y - p1.y) <= 0.8:
                        left, right = sorted((float(p0.x), float(p1.x)))
                        overlap = max(0.0, min(right, bbox[2]) - max(left, bbox[0]))
                        if bbox[1] - 1 <= p0.y <= bbox[3] + 1 and overlap >= (bbox[2] - bbox[0]) * 0.65:
                            segments.append((float(p0.y), max(left, bbox[0]), min(right, bbox[2])))
                elif item[0] == "re":
                    rect = item[1]
                    if rect.width >= (bbox[2] - bbox[0]) * 0.65 and rect.x0 <= bbox[0] + 1 and rect.x1 >= bbox[2] - 1:
                        segments.extend([(float(rect.y0), bbox[0], bbox[2]),
                                         (float(rect.y1), bbox[0], bbox[2])])
        horizontal = []
        if segments:
            for y in cluster_coordinates([segment[0] for segment in segments], 1.0):
                covered = sorted((left, right) for sy, left, right in segments if abs(sy - y) <= 1.0)
                merged = []
                for left, right in covered:
                    if not merged or left > merged[-1][1]:
                        merged.append([left, right])
                    else:
                        merged[-1][1] = max(merged[-1][1], right)
                coverage = sum(right - left for left, right in merged)
                if coverage >= (bbox[2] - bbox[0]) * 0.65:
                    horizontal.append(y)
        y_lines = cluster_coordinates([bbox[1], bbox[3], *horizontal], 1.0)
        if len(x_lines) < 3:
            raise ValueError(f"Could not identify columns in source table at {bbox}")
        if len(y_lines) < 2:
            raise ValueError(f"Could not identify rows in source table at {bbox}")
        rows_grid = [[[] for _ in range(len(x_lines) - 1)] for _ in range(len(y_lines) - 1)]
        for line_y, span in page_spans:
            x0, y0, x1, y1 = (float(v) for v in span["bbox"])
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            if not (bbox[0] <= cx <= bbox[2] and bbox[1] <= cy <= bbox[3]):
                continue
            column = next((i for i in range(len(x_lines) - 1)
                           if x_lines[i] <= cx < x_lines[i + 1]), None)
            row = next((i for i in range(len(y_lines) - 1)
                        if y_lines[i] <= cy < y_lines[i + 1]), None)
            if row is not None and column is not None:
                rows_grid[row][column].append((x0, line_y, x1, span))
        rows = []
        for row in rows_grid:
            cells_text = []
            for cell_words in row:
                cell_words.sort(key=lambda word: (round(word[1], 1), round(word[0], 1)))
                parts = []
                previous_right = None
                previous_text = ""
                previous_y = None
                for x0, y0, x1, span in cell_words:
                    raw_text = CONTROL_RE.sub("", span.get("text", ""))
                    if (parts and previous_y is not None and abs(y0 - previous_y) <= 1.0
                            and previous_right is not None and x0 - previous_right > 0.8
                            and not previous_text.endswith((" ", "\t"))
                            and not raw_text.startswith((" ", "\t"))):
                        parts.append(" ")
                    elif parts and previous_y is not None and abs(y0 - previous_y) > 1.0:
                        parts.append(" ")
                    parts.append(span_markup(span))
                    previous_right, previous_y, previous_text = x1, y0, raw_text
                cells_text.append(clean("".join(parts)))
            rows.append(cells_text)
        rows = [row for row in rows if any(row)]
        if not rows:
            continue
        columns = max(map(len, rows))
        rows = [row + [""] * (columns - len(row)) for row in rows]
        if not 2 <= columns <= 4:
            raise ValueError(
                f"Unsupported {columns}-column source table at {bbox}; "
                "extend the table schema instead of flattening the cells"
            )
        is_page_edge_continuation = (
            page_number is not None
            and (page_number - 1, page_number) in TABLE_CONTINUATION_PAIRS.get(source_name, set())
            and bbox[1] <= float(page.rect.height) * 0.18
        )
        is_header_only = (len(rows) == 1 and all(
            not cell or (cell.startswith("**") and cell.endswith("**"))
            for cell in rows[0]
        ) and any(rows[0]))
        if is_page_edge_continuation:
            # These reviewed top-of-page fragments continue an earlier table;
            # their first visible row is data, even when extraction would call
            # it a header merely because it is first on this page.
            headers, data_rows = [""] * columns, rows
        elif len(rows) > 1 or is_header_only:
            headers, data_rows = rows[0], rows[1:]
        else:
            headers, data_rows = [""] * columns, rows
        result.append((bbox, {
            "type": "table", "headers": headers, "rows": data_rows,
            "widths": [1] * columns,
            "_column_edges": x_lines,
        }))
    return result


def overlaps_table(block_bbox, table_bbox) -> bool:
    x0, y0, x1, y1 = block_bbox
    tx0, ty0, tx1, ty1 = table_bbox
    iw = max(0.0, min(x1, tx1) - max(x0, tx0))
    ih = max(0.0, min(y1, ty1) - max(y0, ty0))
    intersection = iw * ih
    block_area = max(1.0, (x1 - x0) * (y1 - y0))
    table_area = max(1.0, (tx1 - tx0) * (ty1 - ty0))
    return intersection / min(block_area, table_area) >= 0.55


def parse_text_block(raw: str, visually_heading: bool = False,
                     small: bool = False) -> list[dict]:
    lines = [CONTROL_RE.sub("", line).strip() for line in raw.splitlines()]
    lines = [line for line in lines if line]
    if not lines:
        return []
    markers = [TABLE_BULLET_RE.match(line) for line in lines]
    if markers[0] and all(match is None or match.group(1) == markers[0].group(1) for match in markers):
        items = []
        for line, match in zip(lines, markers):
            if match:
                items.append(match.group(2).strip())
            elif items:
                items[-1] += " " + line
        if items and all(items):
            return [{"type": "bullets", "marker": markers[0].group(1), "items": items}]
    option_starts = [(i, OPTION_RE.match(plain_text(line))) for i, line in enumerate(lines)]
    option_starts = [(i, match) for i, match in option_starts if match]
    if len(option_starts) == 5 and [m.group(1).lower() for _, m in option_starts] == list("abcde"):
        first_option = option_starts[0][0]
        prompt_lines = lines[:first_option]
        prompt_text = clean(" ".join(prompt_lines))
        prompt_match = QUESTION_RE.match(plain_text(prompt_text))
        if prompt_match:
            option_values = []
            option_labels = []
            for option_index, (_, marker) in enumerate(option_starts):
                start = option_starts[option_index][0]
                end = option_starts[option_index + 1][0] if option_index + 1 < len(option_starts) else len(lines)
                split = split_styled_match(lines[start], OPTION_RE)
                if split is None:
                    raise ValueError(f"Could not split styled answer label: {marker.group(0)!r}")
                option_label, first_line_body = split
                option_labels.append(option_label)
                option_text = [first_line_body, *lines[start + 1:end]]
                option_values.append(clean(" ".join(part for part in option_text if part)))
            prompt_split = split_styled_match(clean(" ".join(prompt_lines)), QUESTION_RE)
            if prompt_split is None:
                raise ValueError(f"Could not split styled question label: {prompt_match.group(0)!r}")
            question_label, prompt_body = prompt_split
            return [{
                "type": "question",
                "id": prompt_match.group(1),
                "id_separator": prompt_match.group(2),
                "question_label": question_label,
                "prompt": prompt_body,
                "options": option_values,
                "option_labels": option_labels,
                "labels": "".join(match.group(1) for _, match in option_starts),
                "label_separator": option_starts[0][1].group(2),
            }]
    step_items = []
    step_labels = []
    step_numbers = []
    valid_steps = True
    for line in lines:
        match = NUMBERED_RE.match(plain_text(line))
        if match:
            number = int(match.group(1))
            if step_numbers and number != step_numbers[-1] + 1:
                valid_steps = False
                break
            step_numbers.append(number)
            split = split_styled_match(line, NUMBERED_RE)
            if split is None:
                raise ValueError(f"Could not split styled numbered label: {match.group(0)!r}")
            label, body = split
            step_labels.append(label)
            step_items.append(body)
        elif step_items and not OPTION_RE.match(plain_text(line)):
            step_items[-1] += " " + line
        else:
            valid_steps = False
            break
    if valid_steps and len(step_items) >= 2:
        return [{"type": "steps", "start": step_numbers[0], "item_labels": step_labels,
                 "items": step_items}]
    text = clean(" ".join(lines))
    if not text:
        return []
    plain = plain_text(text).strip()
    looks_like_option = bool(OPTION_RE.match(plain))
    if plain.upper().startswith("🦆 VECO TIPS"):
        return [{"type": "title", "text": text}]
    if (not looks_like_option and SECTION_RE.match(plain) and len(plain) < 180):
        return [{"type": "heading", "text": text}]
    if visually_heading and not looks_like_option and len(plain) < 220:
        return [{"type": "heading", "text": text}]
    return [{"type": "paragraph", "text": text, **({"small": True} if small else {})}]


LBE_CALLOUT_LINE_RE = re.compile(r"^[\t ]*(?:🦆\s*VECO\s+TIPS|💡\s*Veco\s+Tips|⚠️?\s*Kesalahan Umum)", re.I)


def split_lbe_source_block(block: dict, source_page: int) -> list[dict]:
    text = block.get("text", "")
    lines = text.splitlines()
    pieces = []
    current = []
    for line in lines:
        if LBE_CALLOUT_LINE_RE.match(plain_text(line).strip()) and current:
            pieces.append("\n".join(current).strip())
            current = [line]
        else:
            current.append(line)
    if current:
        pieces.append("\n".join(current).strip())

    converted = []
    for piece in pieces:
        if not piece:
            continue
        plain = plain_text(piece).strip()
        if plain.upper().startswith("🦆 VECO TIPS"):
            converted.append({"type": "title", "text": clean(piece)})
            continue
        small = source_page == 1 or plain.startswith("Subtes:")
        parsed_blocks = parse_text_block(piece, small=small)
        for parsed in parsed_blocks:
            if block.get("type") == "heading" and parsed["type"] == "paragraph":
                parsed["type"] = "heading"
            converted.append(parsed)
    return converted


def group_lbe_callouts(entries: list[tuple[dict, int]]) -> list[tuple[dict, int]]:
    grouped: list[tuple[dict, int]] = []
    index = 0
    while index < len(entries):
        block, source_page = entries[index]
        title = block.get("text", "") if block.get("type") == "paragraph" else ""
        plain_title = plain_text(title).strip()
        if not SPECIAL_RE.match(plain_title):
            grouped.append((block, source_page))
            index += 1
            continue
        body_blocks = []
        stop = index + 1
        while stop < len(entries):
            next_block, _ = entries[stop]
            next_text = next_block.get("text", "") if next_block.get("type") == "paragraph" else ""
            if (SPECIAL_RE.match(plain_text(next_text).strip())
                    or next_block.get("type") not in ("paragraph", "bullets")):
                break
            body_blocks.append(next_block)
            stop += 1
        if not body_blocks:
            grouped.append((block, source_page))
            index += 1
            continue

        warning = plain_title.startswith("⚠") or "kesalahan umum" in plain_title.lower()
        content = []
        for body_block in body_blocks:
            if body_block.get("type") == "bullets":
                content.append({
                    "type": "bullets",
                    "marker": body_block.get("marker", "•"),
                    "items": body_block["items"],
                    **({"small": True} if body_block.get("small") else {}),
                })
            else:
                content.append({
                    "type": "paragraph",
                    "text": body_block["text"],
                    **({"small": True} if body_block.get("small") else {}),
                })
        callout = {"type": "tip", "title": title, "content": content}
        if warning:
            callout["tone"] = "warning"
        callout["_source_pages"] = sorted({source_page, *(entries[k][1] for k in range(index + 1, stop))})
        grouped.append((callout, source_page))
        index = stop
    return grouped


def lbe_entries(pages: list[dict]) -> list[tuple[dict, int]]:
    entries: list[tuple[dict, int]] = []
    for source_page in pages:
        page_number = source_page["source_pages"][0]
        if source_page.get("title"):
            entries.append(({"type": "title", "text": source_page["title"]}, page_number))
        for block in source_page.get("blocks", []):
            entries.extend((parsed, page_number)
                           for parsed in split_lbe_source_block(block, page_number))
    grouped = group_lbe_callouts(entries)

    # Callout grouping changes only the visual structure. Require the exact
    # authored character stream to survive so failed grouping cannot silently
    # fall back to plain headings and paragraphs.
    def content_stream(items: list[tuple[dict, int]]) -> str:
        blocks = [block for block, _ in items]
        return check_fidelity.canonical(
            check_fidelity.authored_text({"pages": [{"title": "", "blocks": blocks}]})
        )

    if content_stream(entries) != content_stream(grouped):
        raise ValueError("LBE callout grouping changed source text; preserve source block order")
    return grouped


def merge_paragraph_fragments(entries: list[tuple[dict, int]]) -> list[tuple[dict, int]]:
    """Join adjacent extraction fragments when source geometry shows one paragraph/list item."""
    merged: list[tuple[dict, int]] = []
    for block, page_number in entries:
        if not merged:
            merged.append((block, page_number))
            continue
        previous, previous_page = merged[-1]
        previous_type = previous.get("type")
        block_type = block.get("type")
        previous_text = plain_text(previous.get("text", "")).strip()
        next_text = plain_text(block.get("text", "")).strip()
        previous_option = OPTION_RE.match(previous_text)
        next_option = OPTION_RE.match(next_text)
        previous_numbered = NUMBERED_RE.match(previous_text)
        next_numbered = NUMBERED_RE.match(next_text)
        starts_labeled_item = bool(next_option or next_numbered)
        continues_labeled_item = bool(previous_option or previous_numbered) and not starts_labeled_item

        same_paragraph_style = (
            previous_type == block_type == "paragraph"
            and previous.get("small", False) == block.get("small", False)
        )
        can_join = (page_number == previous_page
                    and same_paragraph_style
                    and previous.get("_bbox") is not None
                    and block.get("_bbox") is not None)
        heading_continuation = (page_number == previous_page and previous_type == "heading"
                                and block_type in ("heading", "paragraph")
                                and previous.get("_bbox") is not None
                                and block.get("_bbox") is not None
                                and not re.search(r"[.!?…][\"'’”)]*$", previous_text))
        if heading_continuation:
            # PDF text blocks can split a large heading from a short acronym or
            # closing fragment placed on the same visual line. Rejoin only that
            # line so the body copy below still becomes a distinct paragraph.
            previous_box, next_box = previous["_bbox"], block["_bbox"]
            can_join = (abs(float(next_box[1]) - float(previous_box[1])) <= 1.0
                        and float(next_box[0]) >= float(previous_box[0]))
        list_continuation = (
            page_number == previous_page
            and previous_type in ("bullets", "steps")
            and block_type == "paragraph"
            and previous.get("_bbox") is not None
            and block.get("_bbox") is not None
            and not starts_labeled_item
        )
        if list_continuation:
            can_join = True
        elif starts_labeled_item and not (previous_option or previous_numbered):
            can_join = False
        elif (previous_option or previous_numbered) and starts_labeled_item:
            # A fresh A–E choice or numbered step is its own item.
            can_join = False

        if can_join or list_continuation:
            previous_box, next_box = previous["_bbox"], block["_bbox"]
            gap = max(0.0, float(next_box[1]) - float(previous_box[3]))
            font_size = max(float(previous.get("_font_size", 0)),
                            float(block.get("_font_size", 0)), 9.0)
            max_gap = max(2.5, min(5.0, font_size * 0.4))
            if gap > max_gap:
                can_join = False
            x_offset = float(next_box[0]) - float(previous_box[0])
            min_indent = (0.0 if heading_continuation else
                          8.0 if continues_labeled_item or list_continuation else -5.0)
            max_indent = (float("inf") if heading_continuation else
                          34.0 if continues_labeled_item or list_continuation else 16.0)
            if not (min_indent <= x_offset <= max_indent):
                can_join = False
            if (not heading_continuation and len(previous_text) < 110
                    and previous_text[:1].isupper() \
                    and not re.search(r"[.!?…:;—-][\"'’”)]*$", previous_text) \
                    and float(previous.get("_font_size", 0)) >= 12):
                can_join = False
        if can_join:
            if list_continuation:
                previous["items"][-1] = previous["items"][-1].rstrip() + " " + block["text"].lstrip()
            else:
                previous["text"] = previous["text"].rstrip() + " " + block["text"].lstrip()
            previous["_bbox"] = (
                min(previous["_bbox"][0], block["_bbox"][0]),
                min(previous["_bbox"][1], block["_bbox"][1]),
                max(previous["_bbox"][2], block["_bbox"][2]),
                max(previous["_bbox"][3], block["_bbox"][3]),
            )
            previous["_font_size"] = max(previous.get("_font_size", 0), block.get("_font_size", 0))
        else:
            merged.append((block, page_number))
    return merged


def group_multiple_choice(entries: list[tuple[dict, int]]) -> list[tuple[dict, int]]:
    """Keep a numbered prompt and its five labelled choices together when exact."""
    grouped: list[tuple[dict, int]] = []
    index = 0
    while index < len(entries):
        block, page_number = entries[index]
        prompt_text = plain_text(block.get("text", "")).strip()
        prompt = QUESTION_RE.match(prompt_text) if block.get("type") == "paragraph" else None
        choices = entries[index + 1:index + 6] if prompt else []
        parsed_options = [OPTION_RE.match(plain_text(option.get("text", "")).strip())
                          if option.get("type") == "paragraph" else None
                          for option, _ in choices]
        if (prompt and len(parsed_options) == 5 and all(parsed_options)
                and "".join(match.group(1).lower() for match in parsed_options) == "abcde"
                and len({match.group(2) for match in parsed_options}) == 1
                and all(source_page == page_number for _, source_page in choices)):
            grouped_pages = sorted({page_number, *(source_page for _, source_page in choices)})
            prompt_split = split_styled_match(block["text"], QUESTION_RE)
            option_parts = [split_styled_match(option["text"], OPTION_RE)
                            for option, _ in choices]
            if prompt_split is None or any(parts is None for parts in option_parts):
                raise ValueError("Could not safely separate styled question and option labels")
            grouped.append(({
                "type": "question",
                "id": prompt.group(1),
                "id_separator": prompt.group(2),
                "question_label": prompt_split[0],
                "prompt": prompt_split[1],
                "option_labels": [parts[0] for parts in option_parts],
                "options": [parts[1] for parts in option_parts],
                "labels": "".join(match.group(1) for match in parsed_options),
                "label_separator": parsed_options[0].group(2),
                "_source_pages": grouped_pages,
            }, page_number))
            index += 6
            continue
        grouped.append((block, page_number))
        index += 1
    return grouped


def group_numbered_steps(entries: list[tuple[dict, int]]) -> list[tuple[dict, int]]:
    grouped: list[tuple[dict, int]] = []
    index = 0
    while index < len(entries):
        block, source_page = entries[index]
        match = NUMBERED_RE.match(plain_text(block.get("text", "")).strip()) if block.get("type") == "paragraph" else None
        if not match:
            grouped.append((block, source_page))
            index += 1
            continue
        start = int(match.group(1))
        first_split = split_styled_match(block["text"], NUMBERED_RE)
        if first_split is None:
            raise ValueError(f"Could not split styled numbered item: {match.group(0)!r}")
        item_labels = [first_split[0]]
        items = [first_split[1]]
        pages = {source_page}
        stop = index + 1
        expected = start + 1
        while stop < len(entries):
            candidate, candidate_page = entries[stop]
            candidate_match = NUMBERED_RE.match(plain_text(candidate.get("text", "")).strip()) if candidate.get("type") == "paragraph" else None
            if (not candidate_match or int(candidate_match.group(1)) != expected
                    or candidate_page != source_page):
                break
            candidate_split = split_styled_match(candidate["text"], NUMBERED_RE)
            if candidate_split is None:
                raise ValueError(f"Could not split styled numbered item: {candidate_match.group(0)!r}")
            item_labels.append(candidate_split[0])
            items.append(candidate_split[1])
            pages.add(candidate_page)
            expected += 1
            stop += 1
        if len(items) > 1:
            grouped.append(({
                "type": "steps", "start": start, "item_labels": item_labels,
                "items": items,
                "_source_pages": sorted(pages),
            }, source_page))
            index = stop
        else:
            grouped.append((block, source_page))
            index += 1
    return grouped


def extract_pbm_blocks(source: Path) -> tuple[str, list[tuple[dict, int]]]:
    doc = pymupdf.open(source)
    entries: list[tuple[dict, int]] = []
    material_title = ""
    try:
        page_events = []
        source_page_numbers = []
        for page_index, page in enumerate(doc, 1):
            tables = source_tables(page, source.name, page_index)
            events = [(bbox[1], bbox[0], "table", block, bbox)
                      for bbox, block in tables if block.get("type") == "table"]
            for block in page.get_text("dict")["blocks"]:
                if block.get("type") != 0:
                    continue
                bbox = tuple(float(value) for value in block["bbox"])
                if any(overlaps_table(bbox, table_bbox) for table_bbox, _ in tables):
                    continue
                raw, median_size, max_size = text_block_details(block)
                for parsed in parse_text_block(
                        raw,
                        visually_heading=(max_size >= 13.0
                                          and len(plain_text(raw)) < 220
                                          and not plain_text(raw).strip().isupper()),
                        small=(0 < median_size <= 9.5)):
                    parsed["_bbox"] = bbox
                    parsed["_font_size"] = max_size or median_size
                    events.append((bbox[1], bbox[0], "text", parsed, bbox))
            events.sort(key=lambda event: (round(event[0], 1), round(event[1], 1),
                                           0 if event[2] == "table" else 1))
            page_events.append(events)
            source_page_numbers.append(page_index)
        merge_source_table_continuations(
            page_events, source_page_numbers, float(doc[0].rect.height), source.name
        )
        for page_index, events in zip(source_page_numbers, page_events):
            for _, _, kind, block, _ in events:
                if kind == "text":
                    text = block.get("text", "")
                    plain = plain_text(text)
                    match = MATERIAL_RE.match(plain)
                    if match and not material_title:
                        material_title = clean(match.group(1))
                        # Match and slice the same plain-text stream. The styled
                        # source string contains emphasis delimiters whose bytes
                        # do not belong to the title's visible character count.
                        remainder = clean(plain[match.end(1):])
                        if remainder:
                            entries.append(({
                                "type": "paragraph", "text": remainder,
                                "_bbox": block.get("_bbox"),
                                "_font_size": block.get("_font_size", 0),
                            }, page_index))
                        continue
                entries.append((block, page_index))
    finally:
        doc.close()
    if not material_title:
        raise ValueError(f"Could not identify the material title in {source}")
    entries = merge_paragraph_fragments(entries)
    entries = group_multiple_choice(entries)
    entries = group_numbered_steps(entries)
    # Group tip headings with their explanatory text, preserving the exact sequence.
    grouped: list[tuple[dict, int]] = []
    i = 0
    while i < len(entries):
        block, page_number = entries[i]
        title = block.get("text", "") if block.get("type") == "paragraph" else ""
        if SPECIAL_RE.match(title):
            body_parts = []
            j = i + 1
            while j < len(entries):
                next_block, _ = entries[j]
                next_text = next_block.get("text", "") if next_block.get("type") == "paragraph" else ""
                if (SPECIAL_RE.match(plain_text(next_text))
                        or next_block.get("type") not in ("paragraph", "bullets")
                        or SECTION_RE.match(plain_text(next_text))):
                    break
                if next_block.get("type") == "bullets":
                    body_parts.append({
                        "type": "bullets",
                        "marker": next_block.get("marker", "•"),
                        "items": next_block["items"],
                        **({"small": True} if next_block.get("small") else {}),
                    })
                elif next_text:
                    body_parts.append({
                        "type": "paragraph", "text": next_text,
                        **({"small": True} if next_block.get("small") else {}),
                    })
                j += 1
            if body_parts:
                warning = title.startswith("⚠") or "kesalahan umum" in title.lower()
                grouped.append(({
                    "type": "tip", "title": title,
                    "content": body_parts,
                    **({"tone": "warning"} if warning else {}),
                    "_source_pages": sorted({entries[k][1] for k in range(i, j)}),
                }, page_number))
                i = j
                continue
        grouped.append((block, page_number))
        i += 1
    for block, _ in grouped:
        block.pop("_bbox", None)
        block.pop("_font_size", None)
    authored_stream = lambda items: check_fidelity.canonical(
        check_fidelity.authored_text({
            "pages": [{"title": "", "blocks": [block for block, _ in items]}]
        })
    )
    if authored_stream(entries) != authored_stream(grouped):
        raise ValueError(
            f"PBM callout grouping changed source text or order: {source.name}"
        )
    return material_title, grouped


_MEASUREMENT_CANVAS = None


def measure(block: dict, styles: dict) -> float:
    global _MEASUREMENT_CANVAS
    if _MEASUREMENT_CANVAS is None:
        _MEASUREMENT_CANVAS = render.canvas.Canvas(BytesIO(), pagesize=render.A4)
    total = 0.0
    for flowable in render.make_blocks([block], styles):
        if isinstance(flowable, render.KeepTogether):
            # KeepTogether returns a large forced-split sentinel, but stores
            # ReportLab's measured child height in _H. Its measured height
            # already applies collapsed child spacing; include the wrapper's
            # boundary spacing exactly once.
            flowable.wrapOn(_MEASUREMENT_CANVAS, render.WIDTH, render.H)
            total += float(flowable._H or 0)
            total += float(flowable.getSpaceBefore() or 0)
            total += float(flowable.getSpaceAfter() or 0)
            continue
        _, height = flowable.wrapOn(_MEASUREMENT_CANVAS, render.WIDTH, render.H)
        total += (height + float(flowable.getSpaceBefore() or 0)
                  + float(flowable.getSpaceAfter() or 0))
    return total


def split_tokens(text: str) -> list[str]:
    """Keep inline emphasis spans intact when a long paragraph must split."""
    return re.findall(r"\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*[^*]+\*|\S+", text, re.S)


def split_paragraph(block: dict, available: float, styles: dict) -> tuple[dict, dict] | None:
    words = split_tokens(block["text"])
    if len(words) < 2:
        return None
    low, high, best = 1, len(words) - 1, 0
    while low <= high:
        mid = (low + high) // 2
        candidate = {**block, "text": " ".join(words[:mid])}
        if measure(candidate, styles) <= available:
            best = mid
            low = mid + 1
        else:
            high = mid - 1
    if not best:
        return None
    return ({**block, "text": " ".join(words[:best])},
            {**block, "text": " ".join(words[best:])})


def split_tip(block: dict, available: float, styles: dict) -> tuple[dict, dict] | None:
    text = block.get("text")
    if not text:
        return None
    words = split_tokens(text)
    low, high, best = 1, len(words) - 1, 0
    while low <= high:
        mid = (low + high) // 2
        candidate = {**block, "text": " ".join(words[:mid])}
        if measure(candidate, styles) <= available:
            best = mid
            low = mid + 1
        else:
            high = mid - 1
    if not best:
        return None
    first = {**block, "text": " ".join(words[:best])}
    rest = {"type": "paragraph", "text": " ".join(words[best:])}
    return first, rest


def split_table(block: dict, page_budget: float, styles: dict) -> list[dict] | None:
    rows, headers = block["rows"], block["headers"]
    row_sources = block.get("_row_source_pages", [
        list(block.get("_source_pages", [])) for _ in rows
    ])
    if len(row_sources) != len(rows):
        raise ValueError("Table-row provenance does not match rows before pagination")
    header_sources = (block.get("_header_source_pages",
                                block.get("_source_pages", [])) if any(headers) else [])
    chunks: list[dict] = []
    current: list[list[str]] = []
    current_row_sources: list[list[int]] = []

    def make_chunk(chunk_rows: list[list[str]], chunk_sources: list[list[int]],
                   synthetic: bool) -> dict:
        source_pages = set(header_sources)
        for pages in chunk_sources:
            source_pages.update(pages)
        return {
            **block,
            "rows": chunk_rows,
            "headers": headers,
            "_row_source_pages": chunk_sources,
            "_source_pages": sorted(source_pages),
            "synthetic_header": bool(synthetic and any(headers)),
        }

    for row, row_source in zip(rows, row_sources):
        candidate_rows = current + [row]
        candidate_sources = current_row_sources + [list(row_source)]
        candidate = make_chunk(candidate_rows, candidate_sources, bool(chunks))
        if measure(candidate, styles) <= page_budget:
            current = candidate_rows
            current_row_sources = candidate_sources
            continue
        if not current:
            return None
        chunks.append(make_chunk(current, current_row_sources, bool(chunks)))
        current = [row]
        current_row_sources = [list(row_source)]
        if measure(make_chunk(current, current_row_sources, bool(chunks)), styles) > page_budget:
            return None
    if current:
        chunks.append(make_chunk(current, current_row_sources, bool(chunks)))
    return chunks


def paginate(entries: list[tuple[dict, int]], title: str, index: int) -> list[dict]:
    render.register_fonts()
    styles = render.styles()
    frame_height = render.H - 147
    # Keep a small reserve for ReportLab flowable spacing while using almost all
    # of PBM 01's 82pt/65pt content frame instead of producing sparse pages.
    page_budget = frame_height - 40
    title_height = 0
    if title:
        from reportlab.platypus import Paragraph
        p = Paragraph(render.rich(title), styles["title"])
        title_height = p.wrap(render.WIDTH, render.H)[1] + styles["title"].spaceAfter
    pages: list[dict] = []
    current: list[dict] = []
    current_sources: list[int] = []
    remaining = page_budget - title_height

    def finish() -> None:
        nonlocal current, current_sources, remaining
        if current:
            page_title = title if not pages else ""
            pages.append({
                "id": f"material-{index:02d}-page-{len(pages)+1:02d}",
                "title": page_title,
                "continuation": bool(pages) or not page_title,
                "source_pages": sorted(set(current_sources)),
                "blocks": current,
            })
            current = []
            current_sources = []
        remaining = page_budget

    def append_current(block: dict, fallback_source_page: int) -> None:
        current.append({key: value for key, value in block.items() if not key.startswith("_")})
        current_sources.extend(block.get("_source_pages", [fallback_source_page]))

    pending = list(entries)
    while pending:
        block, source_page = pending.pop(0)
        if block.get("type") == "title" and current:
            finish()
            pending.insert(0, (block, source_page))
            continue
        if (block.get("type") in ("paragraph", "heading")
                and "VECO TIPS" in block.get("text", "").upper()
                and current):
            # Give the original Veco Tips section a clean page start so its
            # heading and callouts cannot make a dense preceding page spill.
            finish()
            pending.insert(0, (block, source_page))
            continue
        height = measure(block, styles)
        if height <= remaining:
            # Keep a section heading with at least the next block when possible.
            if block.get("type") in ("heading", "title") and current and pending:
                next_height = measure(pending[0][0], styles)
                if height + next_height > remaining:
                    finish()
                    pending.insert(0, (block, source_page))
                    continue
            append_current(block, source_page)
            remaining -= height
            continue
        if current:
            finish()
            pending.insert(0, (block, source_page))
            continue
        if block.get("type") == "paragraph":
            pieces = split_paragraph(block, remaining, styles)
            if pieces:
                append_current(pieces[0], source_page)
                finish()
                pending.insert(0, (pieces[1], source_page))
                continue
        if block.get("type") == "tip":
            pieces = split_tip(block, remaining, styles)
            if pieces:
                append_current(pieces[0], source_page)
                finish()
                pending.insert(0, (pieces[1], source_page))
                continue
        if block.get("type") == "table":
            chunks = split_table(block, page_budget, styles)
            if chunks:
                pending = [(chunk, source_page) for chunk in chunks] + pending
                continue
            raise ValueError(
                f"Cannot paginate table row without flattening its cells "
                f"(source page {source_page}, material {index:02d})"
            )
        if block.get("type") == "bullets" and len(block.get("items", [])) > 1:
            items = block["items"]
            cut = len(items) // 2
            pending.insert(0, ({**block, "items": items[cut:]}, source_page))
            pending.insert(0, ({**block, "items": items[:cut]}, source_page))
            continue
        if block.get("type") == "bullets" and block.get("items"):
            raise ValueError(
                f"Cannot paginate an oversized list item without changing list "
                f"structure (source page {source_page}, material {index:02d})"
            )
        raise ValueError(f"Cannot paginate block on source page {source_page}: {block.get('type')} ({height:.1f}pt)")
    finish()
    if not pages:
        raise ValueError(f"Material {index:02d} has no content")
    return pages


def pbm_lessons(selection: set[tuple[str, int]] | None = None) -> list[tuple[dict, Path, str]]:
    selected_indices = ({index for code, index in selection if code == "PBM"}
                        if selection is not None else None)
    if selected_indices == set():
        return []
    sources = sorted(PBM_DIR.glob("*.pdf"))
    if len(sources) != 15:
        raise ValueError(f"Expected 15 PBM source PDFs, found {len(sources)}")
    output = []
    for index, source in enumerate(sources, 1):
        if selected_indices is not None and index not in selected_indices:
            continue
        if index == 1:
            lesson = copy.deepcopy(json.loads(PBM01_MASTER.read_text(encoding="utf-8")))
            require_source_match(source, lesson)
            title = lesson["title"]
        elif index == 2:
            # PBM 02 is a manually composed, visually reviewed canonical source.
            # Its page structure carries paragraph/list decisions that a
            # character-only comparison cannot distinguish from old extraction.
            if not PBM02_MASTER.is_file():
                raise FileNotFoundError(
                    f"Reviewed PBM 02 master is required: {PBM02_MASTER}"
                )
            lesson = copy.deepcopy(json.loads(PBM02_MASTER.read_text(encoding="utf-8")))
            title = lesson["title"]
            if (lesson.get("code") != "PBM" or lesson.get("source") !=
                    f"materi/downloaded-from-google-doc/PBM/{source.name}"):
                raise ValueError("PBM 02 master metadata does not match its source PDF")
            render.validate(lesson)
            require_source_match(source, lesson)
        elif index == 3:
            # PBM 03 is a manually composed, visually reviewed canonical
            # source. Its section and row structure cannot be recovered by
            # the old line-fragment extractor without losing reviewed layout.
            if not PBM03_MASTER.is_file():
                raise FileNotFoundError(
                    f"Reviewed PBM 03 master is required: {PBM03_MASTER}"
                )
            lesson = copy.deepcopy(json.loads(PBM03_MASTER.read_text(encoding="utf-8")))
            title = lesson["title"]
            if (lesson.get("code") != "PBM" or lesson.get("source") !=
                    f"materi/downloaded-from-google-doc/PBM/{source.name}"):
                raise ValueError("PBM 03 master metadata does not match its source PDF")
            render.validate(lesson)
            require_source_match(source, lesson)
        else:
            title, entries = extract_pbm_blocks(source)
            pages = paginate(entries, title, index)
            lesson = {
                "title": title,
                "code": "PBM",
                "subject": "Pemahaman Bacaan & Menulis",
                "source": f"materi/downloaded-from-google-doc/PBM/{source.name}",
                "verbatim": True,
                "pages": pages,
            }
            require_source_match(source, lesson)
        if not lesson.get("pages"):
            raise ValueError(f"No pages in {source}")
        json_path = FRAMEWORK / "examples/PBM" / f"{index:02d}-{slug(title)}.lesson.json"
        output.append((lesson, json_path, "PBM"))
    return output


def same_lesson_content(existing: dict, expected: dict) -> bool:
    metadata = ("title", "code", "subject", "source", "verbatim")
    if any(existing.get(key) != expected.get(key) for key in metadata):
        return False
    old_pages, new_pages = existing.get("pages", []), expected.get("pages", [])
    old_sources = sorted({n for page in old_pages for n in page.get("source_pages", [])})
    new_sources = sorted({n for page in new_pages for n in page.get("source_pages", [])})
    old_text = check_fidelity.canonical(check_fidelity.authored_text(existing))
    new_text = check_fidelity.canonical(check_fidelity.authored_text(expected))
    if old_sources != new_sources:
        return False
    if old_text == new_text:
        return True

    # One prior generated PBM 05 extraction is known to encode two visually
    # confirmed read-order defects: a wrapped arrow example reverses its words,
    # and a page-edge table continuation interleaves cells. Accept only these
    # exact, unique old→new substitutions, and only if they make the complete
    # canonical lesson text identical. Any other difference remains a conflict.
    if existing.get("code") == "PBM" and existing.get("source") == (
            "materi/downloaded-from-google-doc/PBM/05 - Pilihan Kata & Diksi yang Tepat.pdf"):
        prior_order_repairs = (
            (
                "Kawanan guru yang akan mengikuti seminar sudah hadir. → "
                "Rombongan guru... seharusnya",
                "Kawanan guru yang akan mengikuti seminar sudah hadir. → "
                "seharusnya Rombongan guru...",
            ),
            (
                "antara lain / misalnya Posisinya sama dengan yaitu/yakni, tetapi "
                "menyebutkan Banyak hal menyebabkan kenaikan harga, antara lain "
                "SEBAGIAN dari jumlah yang persediaan yang menipis dan lebih "
                "banyak. kenaikan harga BBM.",
                "antara lain / misalnya Posisinya sama dengan yaitu/yakni, tetapi "
                "menyebutkan SEBAGIAN dari jumlah yang lebih banyak. Banyak hal "
                "menyebabkan kenaikan harga, antara lain persediaan yang menipis "
                "dan kenaikan harga BBM.",
            ),
        )
        repaired = old_text
        for prior, corrected in prior_order_repairs:
            if repaired.count(prior) != 1:
                return False
            repaired = repaired.replace(prior, corrected, 1)
        return repaired == new_text
    if existing.get("code") == "PBM" and existing.get("source") == (
            "materi/downloaded-from-google-doc/PBM/09 - Konjungsi dan Hubungan Logis.pdf"):
        # Earlier cell extraction inserted spaces inside six visually wrapped
        # words on PBM 09 page 2. These exact, unique cell strings are joined
        # only for this known legacy lesson, then the complete lesson must match.
        prior_word_joins = (
            ("Konjung si", "Konjungsi"),
            ("penamba han", "penambahan"),
            ("pertentan gan", "pertentangan"),
            ("melainka n", "melainkan"),
            ("sedangk an", "sedangkan"),
            ("kemudia n", "kemudian"),
        )
        repaired = old_text
        for prior, corrected in prior_word_joins:
            if repaired.count(prior) != 1:
                return False
            repaired = repaired.replace(prior, corrected, 1)
        return repaired == new_text
    return False


def main(selection: set[tuple[str, int]] | None = None,
         allow_existing_pdf: bool = False) -> None:
    if selection is not None:
        selection = set(selection)
        if not selection or any(code not in {"LBE", "PBM"} or not 1 <= index <= 15
                                for code, index in selection):
            raise ValueError(f"Invalid selected materials: {selection}")
    lessons = lbe_lessons(selection) + pbm_lessons(selection)
    prepared = {(code, int(json_path.name[:2])) for _, json_path, code in lessons}
    expected = (selection if selection is not None else {
        (code, index) for code in ("LBE", "PBM") for index in range(1, 16)
    })
    if prepared != expected:
        raise ValueError(f"Expected selected materials {sorted(expected)}, prepared {sorted(prepared)}")
    expected_outputs = []
    for lesson, json_path, code in lessons:
        index = int(json_path.name[:2])
        name = slug(lesson["title"])
        series = "-berlian" if code == "PBM" else ""
        stem = f"{index:02d}-{name}{series}-ptn-pro"
        pdf_path = ROOT / "output/pdf" / code / f"{stem}.pdf"
        expected_outputs.append((lesson, json_path, pdf_path, code))
    conflicts = []
    for lesson, json_path, pdf_path, _ in expected_outputs:
        if json_path.exists():
            existing = json.loads(json_path.read_text(encoding="utf-8"))
            # Allow pagination-only changes from an earlier failed run while
            # keeping content, styling, metadata, and source coverage protected.
            if not same_lesson_content(existing, lesson):
                conflicts.append(str(json_path))
        elif pdf_path.exists() and not allow_existing_pdf:
            conflicts.append(str(pdf_path))
    if conflicts:
        raise FileExistsError("Refusing to overwrite unrelated or edited artifacts: " + ", ".join(conflicts))
    for lesson, json_path, _, _ in expected_outputs:
        if json_path in {PBM02_MASTER, PBM03_MASTER}:
            # Keep checked manual compositions byte-for-byte untouched.
            continue
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(lesson, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(lessons)} editable material sources; all source-to-JSON comparisons passed.")
    for lesson, json_path, pdf_path, code in expected_outputs:
        print(f"{code} {json_path.name} -> {pdf_path}")


if __name__ == "__main__":
    main()
