# PTN Pro learning PDF framework

Retypeset learning PDFs into a tidy, consistent PTN Pro document while keeping
the **complete material verbatim**. “Rewrite” in this workflow means rebuilding
the text and layout from editable content. It does not authorize paraphrasing,
correcting, summarizing, adding, or omitting learning content.

## Copyable agent instruction

> Retypeset `materi/<source>.pdf` using `docs/materi-pdf-workflow-guide.md` and
> `materi/_framework/README.md`. Keep the original material verbatim: all wording,
> headings, examples, tables, questions, choices, answer keys, explanations, tips,
> symbols, punctuation and sequence. Build fresh selectable text and tables; never
> overlay or embed original PDF pages. Apply PTN Pro typography, justified body
> text, mascot header logo, whisper-thin low-contrast light-yellowish background
> circle/line traces, and solid green top and bottom bands on every page. Tidy the
> spacing, alignment, wrapping and page breaks. Compare the original text with both
> the editable source and final rendered body. Inspect every final page visually.
> Deliver the PDF and editable source, with a short fidelity/formatting report. Flag
> possible content issues separately without changing them unless I explicitly
> authorize content editing.

## Authority

Follow the repository `AGENTS.md`, [`DESIGN.md`](../../DESIGN.md), and
[Foundations](../../docs/design-guidelines/foundations.md). The renderer reads the
palette from `DESIGN.md`. Its point sizes and page geometry are a print adaptation;
the website and protected design files do not need changes.

If the user later requests content edits, apply the
[copywriting policy](../../.agents/rules/copywriting.md) and
[tutur-humanizer](../../.agents/skills-library/domain/tutur-humanizer/SKILL.md).
Those editing rules never override a verbatim preservation request.

## Content preservation rules

1. Read every source page as an image and as extracted text. Text extraction
   alone does not reliably preserve tables, emphasis or reading order.
2. Preserve every word, spelling, number, capitalization, punctuation mark,
   technical symbol, example, option and answer exactly. Preserve original
   instructional emphasis when a question depends on bold or italic text.
3. Keep the source's sequence. Join sentences split across source pages and move
   headings together with their content. Page boundaries may change.
4. Adjust only presentation: line wrapping, whitespace, fonts, colors, alignment,
   margins, table geometry, typographic emphasis and page breaks. Rebuild real
   tables with selectable cells instead of painting a screenshot.
5. Remove extraction-only zero-width characters and normalize layout whitespace.
   Do not silently replace dashes, quote characters, bullets, math symbols or emoji.
6. If the source seems incorrect, preserve it and record the concern outside the
   learner PDF. Double-checking means checking fidelity and formatting here;
   factual corrections require a separate explicit request.
7. Never import, stamp, merge or place original PDF pages behind the new design.
   Source screenshots are inspection evidence only. Build a new document from
   the editable source. An essential individual figure may be reused and
   attributed; never use an entire source page as the figure.
8. OCR scanned material only when needed, then compare the transcription against
   the images before typesetting. Unreadable content must remain an explicit
   unresolved item rather than being guessed.

## Design rules

| Role | Treatment |
| --- | --- |
| Paper and margins | A4 portrait; 48pt sides; content starts 82pt from top and stops 65pt from bottom |
| Top band | Full-width Voyage Deep `#014C38`, 62pt high; mascot logo (`mascot-veco.png`), white `PTN PRO` wordmark (`LEARNING ACADEMY` subtitle) and subject code only, such as PBM |
| Bottom band | Full-width Voyage Deep, 47pt high; subject alone (no brand prefix) and plain current page number, with no badge, total-page suffix or progress bar |
| Band accent | 2pt Sea-Glass strip along each inner edge |
| Geometry | One green circular field, one angled ribbon and one fine mint arc in the header; one green circular field in the footer; whisper-thin low-contrast light-yellowish (`#FAF1CE`, `0.35pt`, stroke-only) circle and line traces on the reading background |
| Reading surface | White with whisper-thin (`0.35pt`) pale-yellowish `#FAF1CE` circle/line traces (no filled shapes or high-contrast borders); Ink `#173C2D` body text; no source-page background |
| Wordmark | Existing Sports World face; reserved for the `PTN PRO` brand mark |
| Main headings | Manrope 800, 26pt / 32pt; left aligned |
| Subheadings | Plus Jakarta Sans 700, 14pt / 20pt; left aligned |
| Body | Plus Jakarta Sans 500, 10.5pt / 16.5pt; justified (`TA_JUSTIFY`) |
| Lists and options | Justified (`TA_JUSTIFY`) with hanging indent (`bulletIndent: 6pt`, `leftIndent: 24pt`) so all wrapped lines align with the text in front of the bullet/number; compact 15pt leading and 3pt inter-item spacing (10pt after the list) |
| Table cells | Plus Jakarta Sans 9.5pt / 14pt; left aligned (`TA_LEFT`); generous cell padding; soft horizontal rules |
| Table headings | Mint surface with dark green text; left aligned (`TA_LEFT`) |
| Supporting text | 9pt / 13.5pt; justified (`TA_JUSTIFY`); furniture 8pt |
| Symbols | Embedded Noto symbol/emoji faces when the brand fonts lack source characters |

Keep headings with the next paragraph, questions with all options, and tables at
readable size. Split long material across pages rather than shrinking type.
Use consistent column widths, comfortable leading and clear paragraph spacing.
Justify body paragraphs, tip text, supporting text, bullet lists, numbered steps,
and answer options while keeping headings and narrow table cells left-aligned.
In bullet lists, numbered steps, and answer options, place the text in front of
its marker with a hanging indent so wrapped lines never tuck back under the dot,
and keep tighter vertical spacing between items than between paragraphs.
Avoid decorative shadows, nested boxes, high-contrast borders, or controls that appear interactive.
Veco Tips use a distinct mint panel, a Warm Sun highlight behind the original
lightbulb, a bold heading and full-size justified body text. Keep their wording exact;
the common-mistakes section stays outside the tip panels.
Preserve the mascot artwork's colors and proportions. Keep background yellowish
circle/line traces ultra-thin (`0.35pt` `#FAF1CE`, stroke-only, no filled shapes)
so they never look like bordered components.

## Workflow and completion gates

| Stage | Work | Completion criterion |
| --- | --- | --- |
| Inspect | Extract and render every source page. | All pages accounted for; tables and emphasis checked visually. |
| Transcribe | Structure the same text in editable lesson JSON. | Source-to-JSON text comparison passes; all sections retained. |
| Typeset | Apply shared typography, tables and colored bands. | New selectable PDF generated without importing source pages. |
| Audit | Compare the source text with final PDF body; inspect bounds and glyphs. | No unexplained text differences or missing glyphs. |
| Visual QA | Open every page PNG at readable size. | No clipping, overlaps, awkward wraps, orphan headings, broken tables or inconsistent bands. |
| Deliver | Supply PDF, editable JSON and fidelity report. | State page count, checks passed, and any unresolved source concerns. |

## Editable format

See [`examples/pbm1.lesson.json`](examples/pbm1.lesson.json). The top-level fields
are `title`, `code`, `subject`, `source`, `verbatim: true`, and `pages`.
Each page has a stable `id`, its exact source `title`, `source_pages`, and `blocks`.
When a physical continuation starts without a source heading, use `title: ""`
and `continuation: true`. Do not invent a new instructional title to fill space.

| Block | Fields |
| --- | --- |
| `paragraph`, `heading` | Exact `text`; optional `small: true` for supporting text |
| `table` | Exact `headers`, `rows`, optional positive relative column `widths`; two to four columns |
| `bullets` | Exact `items`; original `marker` defaults to `•` |
| `steps` | Exact `items`; optional `start` for original numbering |
| `question` | Original `id`, `prompt`, five `options`, original `labels` such as `abcde` |
| `tip` | Exact original `title` and `text`; groups a tip heading with its paragraph in a mint callout |

`**bold**`, `*italic*` and line breaks are layout markup; other markup is escaped.
Use an empty-string header row on a continued table only when no additional
header wording should be inserted. Page headers and footers are navigation
furniture, separate from the preserved lesson body.

## Tools

Run from the repository root. Follow the resource guard and its launch budget;
these are stages, not permission to run several heavy groups at once. Keep the
Python environment separate from website dependencies.

Batch related sequential render, audit and fidelity commands into one guarded
command group when needed to stay within the project launch budget.

```sh
./_harness/resource-guard.sh status
./_harness/resource-guard.sh run -- uv venv /tmp/vecalss-pdf-venv
./_harness/resource-guard.sh run -- uv pip install --python /tmp/vecalss-pdf-venv/bin/python -r materi/_framework/requirements.txt

# Extract and render a source document.
./_harness/resource-guard.sh run -- /tmp/vecalss-pdf-venv/bin/python materi/_framework/inspect_pdf.py materi/pbm1.pdf tmp/pdfs/pbm1-source

# PBM 01's checked layout recipe slices wording directly from its source snapshot.
./_harness/resource-guard.sh run -- /tmp/vecalss-pdf-venv/bin/python materi/_framework/examples/prepare_pbm1.py

# Build the new PDF from editable content.
./_harness/resource-guard.sh run -- /tmp/vecalss-pdf-venv/bin/python materi/_framework/render.py materi/_framework/examples/pbm1.lesson.json output/pdf/pbm1-vecalss.pdf

# Render final pages, check text retention, bounds and glyphs.
./_harness/resource-guard.sh run -- /tmp/vecalss-pdf-venv/bin/python materi/_framework/inspect_pdf.py output/pdf/pbm1-vecalss.pdf tmp/pdfs/pbm1-final --lesson materi/_framework/examples/pbm1.lesson.json

# Compare original PDF, editable source and final document body.
./_harness/resource-guard.sh run -- /tmp/vecalss-pdf-venv/bin/python materi/_framework/check_fidelity.py materi/pbm1.pdf materi/_framework/examples/pbm1.lesson.json output/pdf/pbm1-vecalss.pdf output/pdf/pbm1-fidelity.json

# When changing tool behavior, run focused failure/round-trip checks.
./_harness/resource-guard.sh run -- /tmp/vecalss-pdf-venv/bin/python materi/_framework/selfcheck.py
```

`check_fidelity.py` collapses runs of layout whitespace while preserving word
boundaries; `di mana` never equals `dimana`. It removes extraction zero-width
spaces and emoji presentation selectors only. All other characters and order must agree. For
reading-order changes such as a complex diagram or multicolumn source, establish
and document the intended reading order from the source images before authoring
a separate adapter; do not weaken this comparison to an unordered word count.

`inspect_pdf.py` uses local PyMuPDF rasterization when Poppler is unavailable.
It produces page PNGs, contact sheets, extracted text and a machine audit.
Machine checks cannot certify visual quality or PDF/UA/PDF/X compliance. Always
inspect the final page images. Source symbols use SIL Open Font License fonts;
their license files are included beside them.

The PBM 01 provenance and checks are documented in
[`examples/pbm1-fidelity.md`](examples/pbm1-fidelity.md). PBM 02 has not yet been
converted. Tool references: [ReportLab font families](https://docs.reportlab.com/reportlab/userguide/ch3_fonts/)
and [tables](https://docs.reportlab.com/reportlab/userguide/ch7_tables/).
