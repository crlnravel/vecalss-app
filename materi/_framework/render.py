"""Build a new PTN Pro learning PDF from reviewed lesson JSON, never a source PDF."""
import argparse
import json
import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase import ttfonts
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, KeepTogether, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
W, H = A4
MARGIN = 48
WIDTH = W - 2 * MARGIN


def load_palette():
    """Read normative colors directly; do not copy a second palette into the renderer."""
    design = (REPO / "DESIGN.md").read_text()
    section = design.split("colors:\n", 1)[1].split("typography:", 1)[0]
    return {name: colors.HexColor(value) for name, value in
            re.findall(r'  ([a-z-]+): "(#[A-Fa-f0-9]{6})"', section)}


C = load_palette()


def register_fonts():
    # ReportLab 5.1 emits non-BMP ToUnicode targets as five hex digits. PDF
    # requires UTF-16BE surrogate pairs; keep the visible emoji and extracted text.
    if not getattr(ttfonts.makeToUnicodeCMap, "_vecalss_utf16", False):
        original_cmap = ttfonts.makeToUnicodeCMap

        def unicode_cmap(fontname, subset):
            result = original_cmap(fontname, subset)
            for codepoint in subset:
                if codepoint > 0xFFFF:
                    result = result.replace(f"<{codepoint:04X}>",
                                            "<" + chr(codepoint).encode("utf-16-be").hex().upper() + ">")
            return result

        unicode_cmap._vecalss_utf16 = True
        ttfonts.makeToUnicodeCMap = unicode_cmap
    for name, file in {
        "Jakarta": "PlusJakartaSans-500-normal.ttf",
        "Jakarta-Bold": "PlusJakartaSans-700-normal.ttf",
        "Jakarta-Italic": "PlusJakartaSans-500-italic.ttf",
        "Jakarta-BoldItalic": "PlusJakartaSans-700-italic.ttf",
        "Manrope": "Manrope-800-normal.ttf",
        "SportsWorld": "SportsWorld-Regular.ttf",
        "NotoEmoji": "NotoEmoji.ttf",
        "NotoSymbols": "NotoSansSymbols2-Regular.ttf",
        "NotoMath": "NotoSansMath-Regular.ttf",
    }.items():
        pdfmetrics.registerFont(TTFont(name, str(ROOT / "fonts" / file)))
    pdfmetrics.registerFontFamily("Jakarta", normal="Jakarta", bold="Jakarta-Bold",
                                italic="Jakarta-Italic", boldItalic="Jakarta-BoldItalic")


def rich(text):
    """Only **bold**, *italic*, and line breaks; arbitrary PDF markup is escaped."""
    text = text.replace("\ufe0f", "")
    text = escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", text)
    text = re.sub(r"([🦆💡⚠]\ufe0f?)", r'<font name="NotoEmoji">\1</font>', text)
    def symbol(match):
        character = match.group(0)
        for family in ("Jakarta", "NotoSymbols", "NotoMath", "NotoEmoji"):
            if ord(character) in pdfmetrics.getFont(family).face.charToGlyph:
                return f'<font name="{family}">{character}</font>'
        raise ValueError(f"No embedded font contains source symbol U+{ord(character):04X}")
    text = re.sub(r"([→↔≠≥●•])", symbol, text)
    return text.replace("\n", "<br/>")


def styles():
    base = dict(fontName="Jakarta", fontSize=10.5, leading=16.5,
                textColor=C["ink"], alignment=TA_JUSTIFY, spaceAfter=10)
    result = {"body": ParagraphStyle("body", **base)}
    result["list"] = ParagraphStyle("list", parent=result["body"], leading=15,
                                    leftIndent=24, bulletIndent=6,
                                    bulletFontName="Jakarta", bulletFontSize=10.5,
                                    spaceAfter=3)
    result["list_end"] = ParagraphStyle("list_end", parent=result["list"], spaceAfter=10)
    result["small"] = ParagraphStyle("small", parent=result["body"], fontSize=9,
                                    leading=13.5, spaceAfter=7)
    result["cell"] = ParagraphStyle("cell", parent=result["body"], fontSize=9.5,
                                   leading=14, alignment=TA_LEFT, spaceAfter=0)
    result["headcell"] = ParagraphStyle("headcell", parent=result["cell"],
                                       fontName="Jakarta-Bold", textColor=C["voyage-deep"])
    result["title"] = ParagraphStyle("title", parent=result["body"], fontName="Manrope",
                                    fontSize=26, leading=32, alignment=TA_LEFT, spaceAfter=16)
    result["heading"] = ParagraphStyle("heading", parent=result["body"], fontName="Jakarta-Bold",
                                      fontSize=14, leading=20, alignment=TA_LEFT, spaceBefore=12,
                                      spaceAfter=8, keepWithNext=True)
    result["cover"] = ParagraphStyle("cover", parent=result["title"], fontSize=43,
                                    leading=49, textColor=C["voyage-deep"])
    return result


class Note(Flowable):
    """Bounded teaching note; a quiet mint surface, no simulated button depth."""
    def __init__(self, title, text, s):
        super().__init__()
        self.title = Paragraph(rich(title), s["headcell"])
        self.body = Paragraph(rich(text), s["small"])
        self.spaceBefore = 8
        self.spaceAfter = 14

    def wrap(self, width, height):
        self.width = width
        self.th = self.title.wrap(width - 28, height)[1]
        self.bh = self.body.wrap(width - 28, height)[1]
        self.height = 28 + self.th + 7 + self.bh
        return width, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(C["sea-glass-wash"])
        c.roundRect(0, 0, self.width, self.height, 9, stroke=0, fill=1)
        self.title.drawOn(c, 14, self.height - 14 - self.th)
        self.body.drawOn(c, 14, 14)


class Tip(Note):
    """A distinct teaching callout using the original lightbulb and wording."""
    def __init__(self, title, text, s):
        super().__init__(title, text, s)
        self.title = Paragraph(rich(title), s["heading"])
        self.body = Paragraph(rich(text), s["body"])
        self.spaceBefore = 12

    def draw(self):
        c = self.canv
        c.setFillColor(C["sea-glass-wash"])
        c.roundRect(0, 0, self.width, self.height, 9, stroke=0, fill=1)
        c.setFillColor(C["warm-sun"])
        c.circle(23, self.height - 24, 10, stroke=0, fill=1)
        self.title.drawOn(c, 14, self.height - 14 - self.th)
        self.body.drawOn(c, 14, 14)


class Voyage(Flowable):
    def __init__(self):
        super().__init__()
        self.width, self.height = WIDTH, 190

    def draw(self):
        c = self.canv
        c.drawImage(str(ROOT / "assets" / "mascot-veco-2.png"), WIDTH - 145, 18,
                    width=140, height=170, preserveAspectRatio=True, mask="auto")
        c.setStrokeColor(C["sea-glass"])
        c.setLineWidth(2)
        c.setDash(3, 5)
        path = c.beginPath()
        path.moveTo(12, 135)
        path.curveTo(155, 165, 80, 40, 225, 70)
        path.curveTo(260, 80, 260, 100, 310, 100)
        c.drawPath(path)
        c.setDash()
        for x, y, number, label in [(12, 135, "1", "Pahami"), (140, 90, "2", "Bedakan"),
                                    (240, 70, "3", "Latih")]:
            c.setFillColor(C["voyage-deep"])
            c.circle(x, y, 11, fill=1, stroke=0)
            c.setFillColor(C["surface"])
            c.setFont("Jakarta-Bold", 9)
            c.drawCentredString(x, y-3, number)
            c.setFillColor(C["voyage-deep"])
            c.drawString(x+17, y-3, label)


def validate(lesson):
    def require(condition, message):
        if not condition:
            raise ValueError(message)
    for key in ("title", "code", "subject", "source", "pages"):
        if not lesson.get(key):
            raise ValueError(f"Missing lesson field: {key}")
    ids = set()
    for page in lesson["pages"]:
        if not page.get("id") or page["id"] in ids:
            raise ValueError("Page IDs must be nonempty and unique")
        ids.add(page["id"])
        if (not page.get("title") and not page.get("continuation")) or not page.get("blocks") or not page.get("source_pages"):
            raise ValueError(f"Incomplete page: {page['id']}")
        for block in page["blocks"]:
            kind = block.get("type")
            if kind in ("paragraph", "heading"):
                require(isinstance(block.get("text"), str) and block["text"], "Empty text")
            elif kind in ("note", "tip"):
                require(block.get("title") and block.get("text"), "Incomplete note")
            elif kind == "table":
                n = len(block["headers"])
                require(2 <= n <= 4, "Use two to four table columns")
                require(block["rows"] and all(len(r) == n for r in block["rows"]), "Ragged table")
                weights = block.get("widths", [1] * n)
                require(len(weights) == n and all(w > 0 for w in weights), "Invalid widths")
            elif kind == "steps":
                require(block.get("items"), "Empty steps")
            elif kind == "question":
                require(block.get("id") and block.get("prompt"), "Incomplete question")
                require(len(block.get("options", [])) == 5, "Questions require five options")
                if not lesson.get("verbatim"):
                    require(all("**" not in o for o in block["options"]), "Do not reveal a key by bolding options")
            elif kind == "references":
                require(block.get("items"), "Empty references")
                require(all(i["url"].startswith("https://") for i in block["items"]), "Invalid source URL")
            elif kind == "route":
                pass
            elif kind == "bullets":
                require(block.get("items"), "Empty bullets")
            else:
                raise ValueError(f"Unknown block: {kind}")


def make_blocks(blocks, s):
    result = []
    for block in blocks:
        kind = block["type"]
        if kind in ("paragraph", "heading"):
            result.append(Paragraph(rich(block["text"]), s["small" if block.get("small") else
                                                            "heading" if kind == "heading" else "body"]))
        elif kind == "note":
            result.append(Note(block["title"], block["text"], s))
        elif kind == "tip":
            result.append(Tip(block["title"], block["text"], s))
        elif kind == "table":
            weights = block.get("widths", [1] * len(block["headers"]))
            has_header = any(block["headers"])
            data = [[Paragraph(rich(t), s["headcell"]) for t in block["headers"]]] if has_header else []
            data += [[Paragraph(rich(str(t)), s["cell"]) for t in row] for row in block["rows"]]
            table = Table(data, colWidths=[WIDTH * w / sum(weights) for w in weights],
                          repeatRows=1 if has_header else 0, hAlign="LEFT", spaceAfter=14)
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), C["sea-glass-wash"] if has_header else C["surface"]),
                ("LINEBELOW", (0, 0), (-1, 0), 0.7, C["sea-glass"]),
                ("LINEBELOW", (0, 1), (-1, -1), 0.4, C["soft-border"]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ]))
            result.append(table)
        elif kind == "steps":
            items = block["items"]
            for n, (i, item) in enumerate(enumerate(items, block.get("start", 1))):
                style = s["list_end" if n == len(items) - 1 else "list"]
                result.append(Paragraph(f"<bullet><b>{i}.</b> </bullet>{rich(item)}", style))
        elif kind == "bullets":
            items = block["items"]
            marker = rich(block.get("marker", "\u2022"))
            for n, item in enumerate(items):
                style = s["list_end" if n == len(items) - 1 else "list"]
                result.append(Paragraph(f"<bullet>{marker} </bullet>{rich(item)}", style))
        elif kind == "question":
            items = [Paragraph(rich(f"{block['id']}. {block['prompt']}"), s["heading"])]
            options = block["options"]
            for n, (letter, option) in enumerate(zip(block.get("labels", "ABCDE"), options)):
                style = s["list_end" if n == len(options) - 1 else "list"]
                items.append(Paragraph(f"<bullet>{escape(letter)}. </bullet>{rich(option)}", style))
            items.append(Spacer(1, 6))
            result.append(KeepTogether(items))
        elif kind == "references":
            for item in block["items"]:
                label, url = escape(item["label"]), escape(item["url"], {'"': '&quot;'})
                result.append(Paragraph(f'<link href="{url}" color="#014C38"><u>{label}</u></link>', s["small"]))
        elif kind == "route":
            result.append(Voyage())
    return result


class LessonDoc(BaseDocTemplate):
    def afterFlowable(self, item):
        if isinstance(item, Paragraph) and item.style.name in ("title", "cover"):
            title = item.getPlainText()
            key = f"section-{self.page}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(title, key, 0)


def page_frame(c, doc, lesson):
    c.saveState()
    # Subtle light-yellowish background circles and thin lines on the reading surface.
    c.saveState()
    body_clip = c.beginPath()
    body_clip.rect(0, 49, W, H - 113)
    c.clipPath(body_clip, stroke=0)
    warm_wash = colors.HexColor("#FFF9E5")
    warm_line = colors.HexColor("#F3D578")
    warm_faint = colors.HexColor("#F8E5A6")
    c.setFillColor(warm_wash)
    c.circle(W + 14, H - 155, 86, stroke=0, fill=1)
    c.circle(-22, 145, 74, stroke=0, fill=1)
    c.setStrokeColor(warm_line)
    c.setLineWidth(0.9)
    c.circle(W + 14, H - 155, 86, stroke=1, fill=0)
    c.circle(-22, 145, 74, stroke=1, fill=0)
    c.setStrokeColor(warm_faint)
    c.setLineWidth(0.65)
    c.circle(W + 14, H - 155, 108, stroke=1, fill=0)
    c.circle(-22, 145, 94, stroke=1, fill=0)
    c.line(W - 96, H - 64, W, H - 160)
    c.line(0, 215, 84, 49)
    c.restoreState()

    # Keep band geometry inside the colored bands, away from lesson text.
    c.setFillColor(C["voyage-deep"])
    c.rect(0, H - 62, W, 62, stroke=0, fill=1)
    c.rect(0, 0, W, 47, stroke=0, fill=1)

    c.saveState()
    header_clip = c.beginPath()
    header_clip.rect(0, H - 62, W, 62)
    c.clipPath(header_clip, stroke=0)
    c.setFillColor(C["voyage-forest"])
    c.circle(W + 5, H + 5, 111, stroke=0, fill=1)
    c.setFillColor(C["voyage-leaf"])
    diagonal = c.beginPath()
    diagonal.moveTo(W - 163, H)
    diagonal.lineTo(W - 120, H)
    diagonal.lineTo(W - 165, H - 62)
    diagonal.lineTo(W - 208, H - 62)
    diagonal.close()
    c.drawPath(diagonal, stroke=0, fill=1)
    c.setStrokeColor(C["sea-glass"])
    c.setLineWidth(0.65)
    c.circle(W - 8, H - 8, 65, stroke=1, fill=0)
    c.setStrokeColor(C["warm-sun"])
    c.setLineWidth(0.75)
    c.circle(W - 8, H - 8, 82, stroke=1, fill=0)
    c.line(W - 230, H, W - 188, H - 62)
    c.restoreState()

    c.saveState()
    footer_clip = c.beginPath()
    footer_clip.rect(0, 0, W, 47)
    c.clipPath(footer_clip, stroke=0)
    c.setFillColor(C["voyage-forest"])
    c.circle(-18, -4, 79, stroke=0, fill=1)
    c.setStrokeColor(C["warm-sun"])
    c.setLineWidth(0.7)
    c.circle(-18, -4, 58, stroke=1, fill=0)
    c.restoreState()

    c.setFillColor(C["sea-glass"])
    c.rect(0, H - 64, W, 2, stroke=0, fill=1)
    c.rect(0, 47, W, 2, stroke=0, fill=1)

    # Use the mascot illustration with its colors and proportions intact.
    c.drawImage(str(ROOT / "assets" / "mascot-veco.png"), MARGIN, H - 55,
                width=44, height=43.2, preserveAspectRatio=True, mask="auto")
    c.setFont("SportsWorld", 17)
    c.setFillColor(C["surface"])
    c.drawString(MARGIN + 52, H - 33, "PTN PRO")
    c.setFont("Jakarta-Bold", 6.4)
    text = c.beginText(MARGIN + 53, H - 46)
    text.setCharSpace(1.05)
    text.textOut("LEARNING ACADEMY")
    text.setCharSpace(0)
    c.drawText(text)
    c.setFont("Jakarta-Bold", 8)
    c.setFillColor(C["surface"])
    c.drawRightString(W - MARGIN, H - 40, lesson["code"])
    c.setFont("Jakarta", 8)
    c.setFillColor(C["surface"])
    c.drawString(MARGIN, 27, lesson["subject"])
    c.drawRightString(W - MARGIN, 27, str(doc.page))
    c.restoreState()


def build(lesson, output):
    validate(lesson)
    register_fonts()
    s = styles()
    output.parent.mkdir(parents=True, exist_ok=True)
    build_path = output.with_name(f".{output.name}.tmp")
    # Reject automatic spillover: logical page references must remain reliable.
    class BoundedCanvas(canvas.Canvas):
        def showPage(self):
            if self._pageNumber > len(lesson["pages"]):
                raise ValueError("Content overflow: split logical pages; never shrink body type")
            super().showPage()

    doc = LessonDoc(str(build_path), pagesize=A4, title=lesson["title"],
                    author="PTN Pro Learning Academy", subject=lesson["subject"],
                    leftMargin=MARGIN, rightMargin=MARGIN, topMargin=82, bottomMargin=65)
    frame = Frame(MARGIN, 65, WIDTH, H - 147, leftPadding=0, rightPadding=0,
                  topPadding=0, bottomPadding=0)
    doc.addPageTemplates(PageTemplate(id="lesson", frames=frame,
                                     onPage=lambda c, d: page_frame(c, d, lesson)))
    story = []
    for i, page in enumerate(lesson["pages"]):
        if i:
            story.append(PageBreak())
        if page["title"]:
            story.append(Paragraph(rich(page["title"]), s["cover" if i == 0 and not lesson.get("verbatim") else "title"]))
        story.extend(make_blocks(page["blocks"], s))
    try:
        doc.build(story, canvasmaker=BoundedCanvas)
    except Exception:
        build_path.unlink(missing_ok=True)
        raise
    # Page-level anchors are a stronger spillover check than total count alone.
    import pymupdf
    pdf = pymupdf.open(build_path)
    try:
        if len(pdf) != len(lesson["pages"]):
            raise ValueError("Unexpected PDF page count")
        for page, expected in zip(pdf, lesson["pages"]):
            normalized = " ".join(page.get_text().split())
            title = " ".join(expected["title"].split())
            if title not in normalized:
                raise ValueError(f"Page overflow before {expected['id']}: title on wrong page")
    except Exception:
        pdf.close()
        build_path.unlink(missing_ok=True)
        raise
    pdf.close()
    build_path.replace(output)
    print(f"Built {output} ({len(lesson['pages'])} pages)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lesson", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(json.loads(args.lesson.read_text()), args.output)
