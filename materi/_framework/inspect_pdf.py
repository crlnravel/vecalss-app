"""Extract reference PDFs or render/audit a newly authored lesson without a browser."""
import argparse
import json
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw


def inspect(pdf_path, out, lesson_path=None):
    out.mkdir(parents=True, exist_ok=True)
    pdf = pymupdf.open(pdf_path)
    text = []
    issues = []
    thumbs = []
    for i, page in enumerate(pdf, 1):
        content = page.get_text(sort=True)
        text.append(f"--- PAGE {i} ---\n{content}")
        if not content.strip():
            issues.append(f"Page {i}: no selectable text; OCR required for source documents")
        page.get_pixmap(matrix=pymupdf.Matrix(1.4, 1.4), alpha=False).save(out / f"page-{i:02}.png")
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    x0, y0, x1, y1 = span["bbox"]
                    if x0 < 0 or y0 < 0 or x1 > page.rect.width + 0.5 or y1 > page.rect.height + 0.5:
                        issues.append(f"Page {i}: text outside page: {span['text'][:50]}")
                    if "\ufffd" in span["text"]:
                        issues.append(f"Page {i}: replacement/missing glyph")
        image = Image.open(out / f"page-{i:02}.png").convert("RGB")
        image.thumbnail((298, 421))
        tile = Image.new("RGB", (318, 453), "#E6EAE7")
        tile.paste(image, ((318-image.width)//2, 8))
        ImageDraw.Draw(tile).text((12, 435), f"Page {i}", fill="#173C2D")
        thumbs.append(tile)
    for start in range(0, len(thumbs), 6):
        group = thumbs[start:start+6]
        sheet = Image.new("RGB", (318*3, 453*2), "white")
        for j, tile in enumerate(group):
            sheet.paste(tile, ((j % 3)*318, (j // 3)*453))
        sheet.save(out / f"contact-{start//6+1}.png")
    (out / "extracted.txt").write_text("\n\n".join(text))
    if lesson_path:
        from render import register_fonts
        register_fonts()
        lesson = json.loads(lesson_path.read_text())
        if len(pdf) != len(lesson["pages"]):
            issues.append("Physical and logical page counts differ")
        for page, expected in zip(pdf, lesson["pages"]):
            if " ".join(expected["title"].split()) not in " ".join(page.get_text().split()):
                issues.append(f"Missing page heading: {expected['id']}")
            # Every visible textual block must survive the PDF round trip.
            from render import rich
            from reportlab.platypus import Paragraph
            from reportlab.lib.styles import getSampleStyleSheet
            from xml.sax.saxutils import unescape
            actual = " ".join(page.get_text().split())
            def check(value):
                plain = unescape(Paragraph(rich(value).replace("<br/>", " "), getSampleStyleSheet()["Normal"]).getPlainText())
                if " ".join(plain.split()) not in actual:
                    issues.append(f"Page {page.number+1}: text missing: {plain[:65]}")
            for block in expected["blocks"]:
                for key in ("text", "title", "prompt"):
                    if key in block:
                        check(block[key])
                for key in ("items", "options", "headers"):
                    for value in block.get(key, []):
                        if isinstance(value, str):
                            check(value)
                        elif isinstance(value, dict) and "label" in value:
                            check(value["label"])
                for row in block.get("rows", []):
                    for value in row:
                        check(value)
        if not pdf.get_toc():
            issues.append("Missing navigation bookmarks")
        fonts = {entry[3] for page in pdf for entry in page.get_fonts()}
        for name in fonts:
            if not any(f in name for f in ("Jakarta", "Manrope", "SportsWorld", "NotoEmoji", "NotoSansSymbols", "NotoSansMath")) and name != "Helvetica":
                issues.append(f"Unexpected font: {name}")
    report = {"pdf": str(pdf_path), "pages": len(pdf), "issues": issues,
              "visual_review_required": True, "note": "Bounds/text checks cannot establish visual quality or factual correctness."}
    (out / "audit.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    pdf.close()
    if lesson_path and issues:
        raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--lesson", type=Path)
    args = parser.parse_args()
    inspect(args.pdf, args.out, args.lesson)
