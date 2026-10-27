# Materi Learning PDF Workflow Guide

This guide documents the end-to-end workflow and tooling for retypesetting raw learning module PDFs (`materi/*.pdf`) into clean, selectable, brand-aligned **PTN Pro** PDFs while preserving **100% of the source material verbatim**.

The implementation lives in [`materi/_framework/`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/README.md).

---

## 1. Where Everything Lives

| Path | Role |
|---|---|
| [`docs/materi-pdf-workflow-guide.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/docs/materi-pdf-workflow-guide.md) | This comprehensive workflow and schema guide |
| [`materi/_framework/README.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/README.md) | Framework README and quick reference inside the `materi/` workspace |
| [`materi/_framework/render.py`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/render.py) | ReportLab PDF renderer (reads palette directly from [`DESIGN.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/DESIGN.md)) |
| [`materi/_framework/inspect_pdf.py`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/inspect_pdf.py) | Source extractor, page PNG/contact-sheet rasterizer, and bounds/glyph/round-trip auditor |
| [`materi/_framework/check_fidelity.py`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/check_fidelity.py) | Strict character-and-word-boundary verifier comparing source PDF, editable JSON, and rendered PDF body |
| [`materi/_framework/selfcheck.py`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/selfcheck.py) | Automated regression suite for validation, overflow rejection, PTN Pro header, justified text, list geometry, and UTF-16BE symbol encoding |
| [`materi/_framework/requirements.txt`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/requirements.txt) | Python dependencies (`reportlab`, `pymupdf`, `pillow`) installed in an isolated venv |
| [`materi/_framework/assets/`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/assets) | Brand illustrations and mascot artwork (`mascot-veco.png`, `mascot-veco-2.png`, `logo-mark.png`) |
| [`materi/_framework/fonts/`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/fonts) | Embedded TTF fonts (`Plus Jakarta Sans`, `Manrope`, `Sports World`, `Noto Emoji/Symbols/Math`) |
| [`materi/_framework/examples/prepare_pbm1.py`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/examples/prepare_pbm1.py) | Reference deterministic recipe slicing `pbm1.source.txt` into `pbm1.lesson.json` |
| [`materi/_framework/examples/pbm1.lesson.json`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/examples/pbm1.lesson.json) | Complete editable lesson JSON example for PBM 01 |
| [`materi/_framework/examples/pbm1-fidelity.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/examples/pbm1-fidelity.md) | Provenance, formatting decisions, and verification record for PBM 01 |
| [`output/pdf/pbm1-vecalss.pdf`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/output/pdf/pbm1-vecalss.pdf) | Final rendered 16-page PBM 01 learning PDF |

---

## 2. Copyable Agent Prompt

Use this prompt whenever you want an agent to convert another module PDF (such as `materi/pbm2.pdf`):

> Retypeset `materi/<source>.pdf` using `docs/materi-pdf-workflow-guide.md` and `materi/_framework/README.md`. Keep the original material verbatim: all wording, headings, examples, tables, questions, choices, answer keys, explanations, tips, symbols, punctuation, and sequence. Build fresh selectable text and tables; never overlay or embed original PDF pages. Apply PTN Pro branding with the mascot header logo, justified body text, borderless soft light-yellowish background accents (a top-right circle and a bottom-left diagonal band), hanging list indents, Veco Tip callouts, and colored top/bottom bands on every page. Compare the original text with both the editable source and final rendered body using `check_fidelity.py`. Inspect every final page visually using `inspect_pdf.py`. Deliver the PDF (`output/pdf/<slug>-vecalss.pdf`) and editable source (`materi/_framework/examples/<slug>.lesson.json`), with a short fidelity/formatting report. Flag possible content issues separately without changing them unless I explicitly authorize content editing.

---

## 3. Verbatim Content Preservation Rules

In this workflow, **"rewrite" means rebuilding the typography and page layout from structured, editable JSON**. It never authorizes paraphrasing, summarizing, fixing typos, changing examples, or omitting content.

1. **Inspect both images and extracted text:** Read every source page as a rasterized PNG and as extracted text (`extracted.txt`). Text extraction alone can miss table structure, bold/italic emphasis, or reading order.
2. **100% verbatim wording:** Preserve every word, spelling, number, capitalization, punctuation mark, technical symbol (`→`, `↔`, `≠`, `≥`), bullet, emoji (`💡`, `🦆`, `⚠`), example, option, answer key, and explanation in exact source sequence.
3. **Preserve instructional emphasis:** Keep original bold (`**...**`) and italic (`*...*`) spans—especially when a question asks about bolded or italicized words in a prompt or option.
4. **Reflow cleanly across pages:** Join sentences split across source page boundaries and keep headings attached to their following paragraph (`keepWithNext`). Physical page breaks may move to cleaner section boundaries.
5. **Rebuild real selectable tables:** Never paste screenshots of source tables or overlay source PDF pages. Construct native tables with selectable text cells.
6. **Whitespace & control characters only:** Collapse layout line-wrap whitespace into single spaces while preserving word boundaries (`di mana` must never collapse into `dimana`). Strip only extraction zero-width characters (`\u200b`, `\ufeff`, `\ufe0f`).
7. **Flag—do not silently fix—source errors:** If a source question has an ambiguous key or typo, preserve it verbatim in the PDF and report the concern separately outside the learner PDF.
8. **OCR policy:** Only use OCR if a source page has no selectable text, and verify every character against the source page PNGs.

---

## 4. Six-Stage Conversion Workflow

| Stage | Action | Gate / Verification |
|---|---|---|
| **1. Inspect** | Run `inspect_pdf.py` on the source PDF to generate `extracted.txt`, `page-XX.png`, and `contact-X.png`. | All source pages accounted for; tables, symbols, and bold/italic spans visually reviewed. |
| **2. Transcribe** | Author `materi/_framework/examples/<slug>.lesson.json` (or a deterministic `prepare_<slug>.py` slicing recipe). | `check_fidelity.py` passes `source_to_editable_lesson` with 0 mismatches. |
| **3. Typeset** | Run `render.py` to build `output/pdf/<slug>-vecalss.pdf`. | Build completes without `BoundedCanvas` page overflow or missing font glyph errors. |
| **4. Audit** | Run `inspect_pdf.py --lesson` on the output PDF and run `check_fidelity.py`. | `audit.json` reports `issues: []`; `check_fidelity.py` passes `source_to_rendered_body`. |
| **5. Visual QA** | Open every rendered `page-XX.png` and `contact-X.png` at readable size. | No text clipping, overlaps, orphan headings, broken tables, or misaligned list wraps. |
| **6. Deliver** | Save the output PDF, `.lesson.json`, and fidelity report. | Report total pages, normalized/non-whitespace character counts, and any flagged source notes. |

### Guarded CLI Commands

Run all commands from the repository root through [`_harness/resource-guard.sh`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/_harness/resource-guard.sh). Keep the Python environment in `/tmp/vecalss-pdf-venv` separate from Node/website dependencies. To respect the per-turn launch budget (`3` guarded launches per turn), batch sequential pipeline steps into a single guarded `sh -c` invocation when appropriate.

```bash
# 0. Check host capacity and initialize the isolated Python venv (once per machine/boot)
./_harness/resource-guard.sh status
./_harness/resource-guard.sh run -- uv venv /tmp/vecalss-pdf-venv
./_harness/resource-guard.sh run -- uv pip install --python /tmp/vecalss-pdf-venv/bin/python -r materi/_framework/requirements.txt

# 1. Inspect and extract the source PDF
./_harness/resource-guard.sh run -- /tmp/vecalss-pdf-venv/bin/python \
  materi/_framework/inspect_pdf.py materi/pbm1.pdf tmp/pdfs/pbm1-source

# 2-5. Prepare JSON (if using a recipe), render PDF, audit pages, and verify verbatim fidelity in one guarded group
./_harness/resource-guard.sh run -- sh -c '
  /tmp/vecalss-pdf-venv/bin/python materi/_framework/examples/prepare_pbm1.py &&
  /tmp/vecalss-pdf-venv/bin/python materi/_framework/render.py \
    materi/_framework/examples/pbm1.lesson.json \
    output/pdf/pbm1-vecalss.pdf &&
  /tmp/vecalss-pdf-venv/bin/python materi/_framework/inspect_pdf.py \
    output/pdf/pbm1-vecalss.pdf \
    tmp/pdfs/pbm1-final \
    --lesson materi/_framework/examples/pbm1.lesson.json &&
  /tmp/vecalss-pdf-venv/bin/python materi/_framework/check_fidelity.py \
    materi/pbm1.pdf \
    materi/_framework/examples/pbm1.lesson.json \
    output/pdf/pbm1-vecalss.pdf \
    output/pdf/pbm1-fidelity.json
'

# 6. Run framework self-checks (only needed when modifying materi/_framework/*.py)
./_harness/resource-guard.sh run -- sh -c '
  /tmp/vecalss-pdf-venv/bin/python materi/_framework/selfcheck.py &&
  /tmp/vecalss-pdf-venv/bin/python -O materi/_framework/selfcheck.py
'
```

---

## 5. Editable Lesson JSON Schema (`*.lesson.json`)

Every lesson JSON file has the following top-level structure:

```json
{
  "title": "PBM 01",
  "code": "PBM",
  "subject": "Pemahaman Bacaan & Menulis",
  "source": "materi/pbm1.pdf",
  "verbatim": true,
  "pages": [
    {
      "id": "p01-cover-huruf-kapital",
      "title": "PBM 01",
      "source_pages": [1, 2],
      "blocks": []
    },
    {
      "id": "p04-huruf-miring-table-cont",
      "title": "",
      "continuation": true,
      "source_pages": [4],
      "blocks": []
    }
  ]
}
```

### Page Rules

- **`id`** *(string, required)*: Unique, stable page identifier (e.g., `"p01-cover-huruf-kapital"`).
- **`title`** *(string, required)*: Exact source title for the page, or `""` when `continuation: true` is set.
- **`continuation`** *(boolean, optional)*: Set to `true` when a page continues a previous section or table without a new top-of-page title. Never invent a synthetic heading on continuation pages.
- **`source_pages`** *(array of integers, required)*: 1-based source PDF page numbers from which this page's content originates.
- **`blocks`** *(array of objects, required)*: Ordered content blocks rendered inside the page frame. Each logical page in `pages` maps 1:1 to a physical PDF page; if content overflows a page frame, `render.py` fails closed with `Content overflow: split logical pages; never shrink body type`.

### Supported Block Types

| `type` | Required Fields | Optional Fields | Description |
|---|---|---|---|
| `"heading"` | `text` *(string)* | — | Section or subsection heading (`Plus Jakarta Sans Bold`, 14pt/20pt, `TA_LEFT`, `keepWithNext: true`). |
| `"paragraph"` | `text` *(string)* | `small: true` | Justified (`TA_JUSTIFY`) body paragraph (10.5pt/16.5pt) or supporting paragraph (`small: true`, 9pt/13.5pt). |
| `"bullets"` | `items` *(string[])* | `marker` *(string, default `"•"`)* | Justified (`TA_JUSTIFY`) bullet list with hanging indent (`bulletIndent: 6pt`, `leftIndent: 24pt`, `leading: 15pt`, `spaceAfter: 3pt`). |
| `"steps"` | `items` *(string[])* | `start` *(int, default `1`)* | Justified (`TA_JUSTIFY`) numbered list (`1.`, `2.`, ...) using the same hanging indent and compact item spacing. |
| `"table"` | `headers` *(string[])*, `rows` *(string[][])* | `widths` *(number[])* | 2-to-4 column table with left-aligned (`TA_LEFT`) cells, mint header row (`#EEF8F1`), and padded cells. Use `headers: ["", ...]` on an unheaded continuation table. |
| `"question"` | `id` *(string)*, `prompt` *(string)*, `options` *(5 strings)* | `labels` *(string, default `"ABCDE"`)* | Keeps question prompt and all 5 options together on one page (`KeepTogether`), with justified hanging-indented options. |
| `"tip"` | `title` *(string)*, `text` *(string)* | — | Veco Tip callout rendered in a rounded Sea-Glass Wash (`#EEF8F1`) panel with a Warm Sun (`#FFD766`) circle highlight behind the lightbulb icon and justified body text. |
| `"note"` | `title` *(string)*, `text` *(string)* | — | Compact bounded teaching note on a mint surface with justified supporting text. |
| `"references"` | `items` *(`{label, url}`[])* | — | External `https://` reference links styled in Voyage Deep. |

### Inline Markup

Inside any `text`, `title`, `prompt`, `items`, `options`, `headers`, or `rows` string:
- `**bold text**` renders as bold (`Jakarta-Bold`).
- `*italic text*` renders as italic (`Jakarta-Italic`).
- `\n` inserts a line break (`<br/>`).
- All XML/HTML special characters (`<`, `>`, `&`) are automatically escaped.
- Unicode symbols (`→`, `↔`, `≠`, `≥`, `●`, `•`) and emojis (`🦆`, `💡`, `⚠`) are automatically routed to the embedded `NotoSymbols`, `NotoMath`, or `NotoEmoji` fonts.

---

## 6. Visual Design & Layout Rules

The renderer pulls color tokens directly from [`DESIGN.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/DESIGN.md).

- **Page Geometry:** A4 portrait (`595.27pt × 841.89pt`), `48pt` left/right margins, content frame starting `82pt` from top and ending `65pt` from bottom.
- **Top Band (`62pt` high, borderless):** Full-width Voyage Deep (`#014C38`) with borderless clipped geometric accents (one forest circle, one leaf diagonal ribbon), mascot logo (`mascot-veco.png`), `PTN PRO` (`LEARNING ACADEMY`) wordmark, and right-aligned subject code (`PBM`).
- **Bottom Band (`47pt` high, borderless):** Full-width Voyage Deep (`#014C38`) with one borderless clipped forest circle, left-aligned subject name (`Pemahaman Bacaan & Menulis`), and right-aligned plain page number (`1`, `2`, ...).
- **Borderless Light-Yellowish Background Shapes:** Clipped to the reading canvas (`y: 47pt..H-62pt`) behind all text and tables: borderless (`stroke=0`, `fill=1`) soft light-yellowish (`#FFF7D6`) accents consisting of one circle on the top right and one diagonal band on the bottom left.
- **Text Alignment:** Body paragraphs, tip text, supporting text, bullet items, numbered steps, and multiple-choice options are justified (`TA_JUSTIFY`). Page titles, section headings, and table cells remain left-aligned (`TA_LEFT`).
- **Hanging Lists & Options:** Bullet items, numbered steps, and multiple-choice options place their text in front of the dot/number (`bulletIndent: 6pt`, `leftIndent: 24pt`) so wrapped continuation lines align cleanly with the first line's text rather than wrapping underneath the marker. Consecutive items use `15pt` leading and `3pt` spacing (`10pt` after the final item).
- **Veco Tips:** Each tip heading and body is wrapped in a `tip` block (`sea-glass-wash` rounded panel with a `warm-sun` circular highlight behind the `💡` emoji), keeping common-mistakes sections outside the tip panel.
