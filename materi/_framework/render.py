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
YELLOW_WASH = colors.HexColor("#FFF7D6")


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


def _inline_markup(value):
    """Escape text and parse balanced emphasis runs without merging delimiters."""
    output = []
    stack = []
    cursor = index = 0
    marker_width = {"b": 2, "i": 1}

    def open_style(width):
        if width == 1:
            output.append("<i>")
            stack.append("i")
        elif width == 2:
            output.append("<b>")
            stack.append("b")
        elif width == 3:
            output.extend(("<b>", "<i>"))
            stack.extend(("b", "i"))
        else:
            output.append(escape("*" * width))

    while index < len(value):
        if value[index] != "*":
            index += 1
            continue
        output.append(escape(value[cursor:index]))
        end = index
        while end < len(value) and value[end] == "*":
            end += 1
        remaining = end - index
        while stack and remaining >= marker_width[stack[-1]]:
            tag = stack.pop()
            output.append(f"</{tag}>")
            remaining -= marker_width[tag]
        if remaining:
            open_style(remaining)
        cursor = index = end
    output.append(escape(value[cursor:]))
    if stack:
        # Leave malformed/unclosed source markup literal instead of emitting
        # invalid paragraph XML. Well-formed generated emphasis is handled above.
        return escape(value)
    return "".join(output)


def rich(text, emoji_color=None, preserve_line_breaks=False):
    """Render inline markup, joining extraction wraps unless a hard break is explicit."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if not preserve_line_breaks:
        # Extracted PDF line endings are layout artifacts inside one semantic
        # paragraph. Join them before justification so they do not become
        # ragged, forced short lines. Intentional breaks require an explicit
        # preserve_line_breaks flag in the editable lesson.
        text = re.sub(r"[ \t]*\n[ \t]*", " ", text)
        text = re.sub(r" {2,}", " ", text)
    text = text.replace("\ufe0f", "")
    text = _inline_markup(text)
    emoji_font = f'<font name="NotoEmoji" color="{emoji_color}">\\1</font>' if emoji_color else r'<font name="NotoEmoji">\1</font>'
    text = re.sub(r"([🦆💡⚠✅❌]\ufe0f?)", emoji_font, text)
    def symbol(match):
        character = match.group(0)
        for family in ("Jakarta", "NotoSymbols", "NotoMath", "NotoEmoji"):
            if ord(character) in pdfmetrics.getFont(family).face.charToGlyph:
                return f'<font name="{family}">{character}</font>'
        raise ValueError(f"No embedded font contains source symbol U+{ord(character):04X}")
    text = re.sub(r"([→↔≠≥●•■])", symbol, text)
    text = text.replace("\u200b", "").replace("\ufeff", "")
    return text.replace("\n", "<br/>") if preserve_line_breaks else text


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
    result["small_list"] = ParagraphStyle("small_list", parent=result["small"],
                                         leading=13.5, leftIndent=24, bulletIndent=6,
                                         bulletFontName="Jakarta", bulletFontSize=9,
                                         spaceAfter=3)
    result["small_list_end"] = ParagraphStyle("small_list_end", parent=result["small_list"],
                                             spaceAfter=7)
    result["cell"] = ParagraphStyle("cell", parent=result["body"], fontSize=9.5,
                                   leading=14, alignment=TA_LEFT, spaceAfter=0)
    result["headcell"] = ParagraphStyle("headcell", parent=result["cell"],
                                       fontName="Jakarta-Bold", textColor=C["voyage-deep"])
    result["title"] = ParagraphStyle("title", parent=result["body"], fontName="Manrope",
                                    fontSize=26, leading=32, alignment=TA_LEFT, spaceAfter=16,
                                    keepWithNext=True)
    result["heading"] = ParagraphStyle("heading", parent=result["body"], fontName="Jakarta-Bold",
                                      fontSize=14, leading=20, alignment=TA_LEFT, spaceBefore=12,
                                      spaceAfter=8, keepWithNext=True)
    result["cover"] = ParagraphStyle("cover", parent=result["title"], fontSize=43,
                                    leading=49, textColor=C["voyage-deep"])
    return result


class Note(Flowable):
    """Bounded teaching note; a quiet mint surface, no simulated button depth."""
    def __init__(self, title, text, s, preserve_line_breaks=False):
        super().__init__()
        self.title = Paragraph(rich(title, preserve_line_breaks=preserve_line_breaks), s["headcell"])
        self.body = Paragraph(rich(text, preserve_line_breaks=preserve_line_breaks), s["small"])
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
    """A distinct teaching callout using the original icon and wording."""
    def __init__(self, title, s, text=None, items=None, marker="•", tone=None,
                 content=None, preserve_line_breaks=False):
        Flowable.__init__(self)
        is_warning = tone == "warning" or "⚠" in title or "kesalahan umum" in title.lower()
        self.bg_color = YELLOW_WASH if is_warning else C["sea-glass-wash"]
        icon_color = C["voyage-deep"].hexval().replace("0x", "#") if is_warning else C["rating-gold"].hexval().replace("0x", "#")
        self.title = Paragraph(rich(
            title, emoji_color=icon_color,
            preserve_line_breaks=preserve_line_breaks
        ), s["heading"])
        self.body = []
        if content is not None:
            for part in content:
                if part["type"] == "paragraph":
                    part_style = s["small"] if part.get("small") else s["body"]
                    self.body.append((Paragraph(rich(
                        part["text"], preserve_line_breaks=part.get(
                            "preserve_line_breaks", preserve_line_breaks
                        )
                    ), part_style), 6))
                elif part["type"] == "bullets":
                    part_items = part["items"]
                    m = rich(part.get("marker", "•"))
                    for index, item in enumerate(part_items):
                        if part.get("small"):
                            list_style = "small_list_end" if index == len(part_items) - 1 else "small_list"
                        else:
                            list_style = "list_end" if index == len(part_items) - 1 else "list"
                        style = s[list_style]
                        gap = 3 if index < len(part_items) - 1 else 6
                        self.body.append((
                            Paragraph(f"<bullet>{m} </bullet>{rich(
                                item, preserve_line_breaks=part.get(
                                    "preserve_line_breaks", preserve_line_breaks
                                )
                            )}", style), gap
                        ))
                else:
                    raise ValueError(f"Unknown tip content block: {part['type']}")
            if self.body:
                flowable, _ = self.body[-1]
                self.body[-1] = (flowable, 0)
        elif items:
            m = rich(marker)
            for index, item in enumerate(items):
                style = s["list_end" if index == len(items) - 1 else "list"]
                self.body.append((
                    Paragraph(f"<bullet>{m} </bullet>{rich(
                        item, preserve_line_breaks=preserve_line_breaks
                    )}", style),
                    3 if index < len(items) - 1 else 0,
                ))
        else:
            self.body = [(Paragraph(rich(
                text, preserve_line_breaks=preserve_line_breaks
            ), s["body"]), 0)]
        self.spaceBefore = 12
        self.spaceAfter = 14

    def wrap(self, width, height):
        self.width = width
        inner = width - 28
        self.th = self.title.wrap(inner, height)[1]
        self.body_heights = [item.wrap(inner, height)[1] for item, _ in self.body]
        self.bh = sum(self.body_heights) + sum(gap for _, gap in self.body)
        self.height = 28 + self.th + 7 + self.bh
        return width, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(self.bg_color)
        c.roundRect(0, 0, self.width, self.height, 9, stroke=0, fill=1)
        self.title.drawOn(c, 14, self.height - 14 - self.th)
        y = 14 + self.bh
        for (item, gap), h in zip(self.body, self.body_heights):
            y -= h
            item.drawOn(c, 14, y)
            y -= gap


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

    def validate_line_break_flag(value):
        if "preserve_line_breaks" in value:
            require(type(value["preserve_line_breaks"]) is bool,
                    "preserve_line_breaks must be a boolean")

    def visible_markup(value):
        return re.sub(r"\*{1,3}", "", value)

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
            validate_line_break_flag(block)
            kind = block.get("type")
            if kind in ("paragraph", "heading", "title"):
                require(isinstance(block.get("text"), str) and block["text"], "Empty text")
            elif kind == "note":
                require(block.get("title") and block.get("text"), "Incomplete note")
            elif kind == "tip":
                require(block.get("title") and (block.get("text") or block.get("items") or block.get("content")), "Incomplete tip")
                for part in block.get("content", []):
                    validate_line_break_flag(part)
                    if part.get("type") == "paragraph":
                        require(bool(part.get("text")), "Empty tip paragraph")
                    elif part.get("type") == "bullets":
                        require(bool(part.get("items")), "Empty tip bullet list")
                    else:
                        raise ValueError(f"Unknown tip content block: {part.get('type')}")
            elif kind == "table":
                n = len(block["headers"])
                require(2 <= n <= 4, "Use two to four table columns")
                require((block["rows"] or any(block["headers"]))
                        and all(len(r) == n for r in block["rows"]), "Ragged table")
                require(not block.get("synthetic_header") or any(block["headers"]),
                        "Synthetic table headers must repeat a source header")
                weights = block.get("widths", [1] * n)
                require(len(weights) == n and all(w > 0 for w in weights), "Invalid widths")
            elif kind == "steps":
                require(block.get("items"), "Empty steps")
                if "item_labels" in block:
                    labels = block["item_labels"]
                    start = block.get("start", 1)
                    require(len(labels) == len(block["items"]),
                            "Numbered-step labels must match the number of items")
                    require(all(isinstance(label, str) for label in labels),
                            "Numbered-step labels must be strings")
                    require(all(re.fullmatch(rf"{number}[.)]", visible_markup(label))
                                for number, label in enumerate(labels, start)),
                            "Numbered-step labels must preserve their source sequence")
            elif kind == "question":
                require(block.get("id") and block.get("prompt"), "Incomplete question")
                require(len(block.get("options", [])) == 5, "Questions require five options")
                require(block.get("id_separator", ".") in (".", ")"), "Invalid question label separator")
                require(block.get("label_separator", ".") in (".", ")"), "Invalid option label separator")
                require(len(block.get("labels", "ABCDE")) == len(block["options"]),
                        "Answer-option letters must match the number of options")
                question_label = block.get(
                    "question_label", block["id"] + block.get("id_separator", ".")
                )
                require(isinstance(question_label, str), "Question label must be a string")
                require(visible_markup(question_label)
                        == block["id"] + block.get("id_separator", "."),
                        "Question label must retain its visible identifier and separator")
                if "option_labels" in block:
                    labels = block["option_labels"]
                    letters = block.get("labels", "ABCDE")
                    separator = block.get("label_separator", ".")
                    require(len(labels) == len(block["options"]),
                            "Answer-option labels must match the number of options")
                    require(all(isinstance(label, str) for label in labels),
                            "Answer-option labels must be strings")
                    require(all(visible_markup(label) == f"{letter}{separator}"
                                for label, letter in zip(labels, letters)),
                            "Answer-option labels must retain their visible sequence")
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
        if kind in ("paragraph", "heading", "title"):
            result.append(Paragraph(rich(
                block["text"], preserve_line_breaks=block.get("preserve_line_breaks", False)
            ), s["small" if block.get("small") else
                                                            "title" if kind == "title" else
                                                            "heading" if kind == "heading" else "body"]))
        elif kind == "note":
            result.append(Note(block["title"], block["text"], s,
                               preserve_line_breaks=block.get("preserve_line_breaks", False)))
        elif kind == "tip":
            result.append(Tip(block["title"], s, text=block.get("text"),
                              items=block.get("items"), marker=block.get("marker", "•"),
                              tone=block.get("tone"), content=block.get("content"),
                              preserve_line_breaks=block.get("preserve_line_breaks", False)))
        elif kind == "table":
            weights = block.get("widths", [1] * len(block["headers"]))
            has_header = any(block["headers"])
            preserve_breaks = block.get("preserve_line_breaks", False)
            data = [[Paragraph(rich(t, preserve_line_breaks=preserve_breaks), s["headcell"])
                     for t in block["headers"]]] if has_header else []
            data += [[Paragraph(rich(str(t), preserve_line_breaks=preserve_breaks), s["cell"])
                      for t in row] for row in block["rows"]]
            table = Table(data, colWidths=[WIDTH * w / sum(weights) for w in weights],
                          repeatRows=1 if has_header else 0, hAlign="LEFT", spaceAfter=14)
            vertical_padding = 4 if len(data) > 7 else 7
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), C["sea-glass-wash"] if has_header else C["surface"]),
                ("LINEBELOW", (0, 0), (-1, 0), 0.7, C["sea-glass"]),
                ("LINEBELOW", (0, 1), (-1, -1), 0.4, C["soft-border"]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), vertical_padding),
                ("BOTTOMPADDING", (0, 0), (-1, -1), vertical_padding),
            ]))
            result.append(table)
        elif kind == "steps":
            items = block["items"]
            labels = block.get("item_labels")
            for n, (i, item) in enumerate(enumerate(items, block.get("start", 1))):
                style = s["list_end" if n == len(items) - 1 else "list"]
                label = rich(labels[n]) if labels is not None else f"<b>{i}.</b>"
                result.append(Paragraph(f"<bullet>{label} </bullet>{rich(
                    item, preserve_line_breaks=block.get("preserve_line_breaks", False)
                )}", style))
        elif kind == "bullets":
            items = block["items"]
            marker = rich(block.get("marker", "•"))
            for n, item in enumerate(items):
                style = s["list_end" if n == len(items) - 1 else "list"]
                result.append(Paragraph(f"<bullet>{marker} </bullet>{rich(
                    item, preserve_line_breaks=block.get("preserve_line_breaks", False)
                )}", style))
        elif kind == "question":
            id_separator = block.get("id_separator", ".")
            label_separator = block.get("label_separator", ".")
            preserve_breaks = block.get("preserve_line_breaks", False)
            question_label = block.get("question_label", f"{block['id']}{id_separator}")
            items = [Paragraph(
                f"{rich(question_label)} {rich(block['prompt'], preserve_line_breaks=preserve_breaks)}",
                s["heading"]
            )]
            options = block["options"]
            for n, (letter, option) in enumerate(zip(block.get("labels", "ABCDE"), options)):
                style = s["list_end" if n == len(options) - 1 else "list"]
                option_label = block.get("option_labels", [])[n] if block.get("option_labels") else f"{letter}{label_separator}"
                items.append(Paragraph(f"<bullet>{rich(option_label)} </bullet>{rich(
                    option, preserve_line_breaks=preserve_breaks
                )}", style))
            items.append(Spacer(1, 6))
            result.append(KeepTogether(items))
        elif kind == "references":
            for item in block["items"]:
                label = rich(item["label"], preserve_line_breaks=block.get(
                    "preserve_line_breaks", False
                ))
                url = escape(item["url"], {'"': '&quot;'})
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


def page_background(c, doc, lesson):
    c.saveState()
    # Borderless (`stroke=0`) soft yellowish background shapes on the reading surface:
    # one circle on the top right and one diagonal band on the bottom left.
    c.saveState()
    body_clip = c.beginPath()
    body_clip.rect(0, 47, W, H - 109)
    c.clipPath(body_clip, stroke=0)
    c.setFillColor(YELLOW_WASH)
    c.circle(W + 60, H - 150, 95, stroke=0, fill=1)
    lower_ribbon = c.beginPath()
    lower_ribbon.moveTo(-105, 185)
    lower_ribbon.lineTo(-105, 145)
    lower_ribbon.lineTo(-7, 47)
    lower_ribbon.lineTo(33, 47)
    lower_ribbon.close()
    c.drawPath(lower_ribbon, stroke=0, fill=1)
    c.restoreState()
    c.restoreState()

def page_furniture(c, page_number, lesson):
    c.saveState()
    c.resetTransforms()
    # Draw the PBM 01 furniture after the page body so it stays clear of flowing
    # content and cannot inherit a transform left behind by a flowable.
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
    c.restoreState()

    c.saveState()
    footer_clip = c.beginPath()
    footer_clip.rect(0, 0, W, 47)
    c.clipPath(footer_clip, stroke=0)
    c.setFillColor(C["voyage-forest"])
    c.circle(-18, -4, 79, stroke=0, fill=1)
    c.restoreState()

    # Use the mascot illustration with its colors and proportions intact.
    c.drawImage(str(ROOT / "assets" / "mascot-veco.png"), MARGIN, H - 55,
                width=44, height=43.2, preserveAspectRatio=True, mask="auto")
    c.setFont("SportsWorld", 17)
    c.setFillColor(C["surface"])
    c.drawString(MARGIN + 52, H - 33, "PTN PRO")
    c.setFont("Jakarta-Bold", 8)
    c.setFillColor(C["surface"])
    c.drawRightString(W - MARGIN, H - 40, lesson["code"])
    c.setFont("Jakarta", 8)
    c.setFillColor(C["surface"])
    c.drawString(MARGIN, 27, lesson["subject"])
    c.drawRightString(W - MARGIN, 27, str(page_number))
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
                logical_page = getattr(self, "_logical_page_number", "unknown")
                raise ValueError(
                    f"Content overflow on physical page {self._pageNumber} "
                    f"while laying out logical page {logical_page} "
                    f"(lesson has {len(lesson['pages'])} logical pages): "
                    "split logical pages; never shrink body type"
                )
            super().showPage()

    doc = LessonDoc(str(build_path), pagesize=A4, title=lesson["title"],
                    author="PTN Pro", subject=lesson["subject"],
                    leftMargin=MARGIN, rightMargin=MARGIN, topMargin=82, bottomMargin=65)
    frame = Frame(MARGIN, 65, WIDTH, H - 147, leftPadding=0, rightPadding=0,
                  topPadding=0, bottomPadding=0)
    doc.addPageTemplates(PageTemplate(
        id="lesson",
        frames=frame,
        onPage=lambda c, d: page_background(c, d, lesson),
        onPageEnd=lambda c, d: page_furniture(c, d.page, lesson),
    ))
    story = []
    class LogicalPageMarker(Flowable):
        def __init__(self, number):
            super().__init__()
            self.number = number

        def wrap(self, width, height):
            self.width, self.height = 0, 0.1
            return self.width, self.height

        def draw(self):
            self.canv._logical_page_number = self.number

    for i, page in enumerate(lesson["pages"]):
        if i:
            story.append(PageBreak())
        story.append(LogicalPageMarker(i + 1))
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
