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
> text, mascot header logo, borderless soft light-yellowish background accents
> (a top-right circle and a bottom-left diagonal band), and solid green top and
> bottom bands on every page. Tidy the spacing, alignment, wrapping and page breaks.
> Compare the original text with both the editable source and final rendered body.
> Inspect every final page visually. Deliver the PDF and editable source, with a
> short fidelity/formatting report. Flag possible content issues separately without
> changing them unless I explicitly authorize content editing.

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
| Top band | Full-width Voyage Deep `#014C38`, 62pt high, borderless; mascot logo (`mascot-veco.png`), white `PTN PRO` wordmark and subject code only, such as PBM |
| Bottom band | Full-width Voyage Deep, 47pt high, borderless; subject alone (no brand prefix) and plain current page number, with no badge, total-page suffix or progress bar |
| Geometry | Borderless (`stroke=0`) shapes only: one green circular field and one angled ribbon in the header, one green circular field in the footer, plus soft light-yellowish (`#FFF7D6`) accents on the reading background (one top-right circle and one bottom-left diagonal band), both fully outside the 48pt content frame with at least 12pt clearance |
| Reading surface | White with a borderless (`stroke=0`) soft light-yellowish `#FFF7D6` top-right circle and bottom-left diagonal band behind the body frame; the circle stays beyond the right text edge and the band stays left of the left text edge with at least 12pt clearance; Ink `#173C2D` body text; no source-page background |
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
This is a mandatory visual completion gate, not just a `TA_JUSTIFY` setting.
Join extraction-only line wraps into complete semantic paragraphs before rendering:
retained newlines become `<br/>`, and splitting every extracted line into its own
paragraph leaves every line behaving like a short final line. Preserve genuine
paragraph/list boundaries, instructional emphasis and word boundaries. Keep only
meaningful explicit line breaks, documenting exceptions such as verse or addresses.
Full lines must meet both text edges with natural spacing on the final line;
never force-stretch the final line or pad it with spaces. Inspect multiline prose,
explanations, list items, options and callouts in both subjects at readable size.
Reject ragged prose caused by forced source wraps and excessive word gaps caused
by fragmented paragraphs. Text fidelity strips emphasis markup, so manually
inspect bold/italic labels and body spans; the representative proof gate calls
out both the label and body emphasis of PBM 05's bold `b.` answer choice. See
the workflow guide's **Full
justification and paragraph reconstruction** gate for the subagent handoff.
In bullet lists, numbered steps, and answer options, place the text in front of
its marker with a hanging indent so wrapped lines never tuck back under the dot,
and keep tighter vertical spacing between items than between paragraphs.
Avoid decorative shadows, nested boxes, borders, or controls that appear interactive.
Veco Tips use a mint callout panel (`sea-glass-wash` `#EEF8F1`) with a yellow
(`#E8AD16`) `💡` icon and no circle behind the icon. The `Kesalahan Umum yang Sering Terjadi`
warning callout (`tone: "warning"`) uses a thin yellow background (`#FFF7D6`) with a
dark green (`#014C38`) `⚠️` icon and no circle behind the icon. Both keep their
wording exact with a bold heading and full-size justified body or hanging-indented
bullet items.
Preserve the mascot artwork's colors and proportions. Keep all background and
header/footer geometry borderless (`stroke=0`) with soft light-yellowish fills
(`#FFF7D6`) on the reading surface.

## Workflow and completion gates

For multiple lessons, follow the **Delegated batch workflow and PBM 01 visual reference** in [`../../docs/materi-pdf-workflow-guide.md`](../../docs/materi-pdf-workflow-guide.md#delegated-batch-workflow-and-pbm-01-visual-reference). Assign one subagent the shared renderer and sequential batch runner. Match the saved PBM 01 reference, keep Learning Academy removed, group tips instead of giving every tip its own page, and check representative proofs before regenerating the complete manifest. Return fidelity results and visual-review status for every material; text fidelity alone does not establish design quality.

| Stage | Work | Completion criterion |
| --- | --- | --- |
| Inspect | Extract and render every source page. | All pages accounted for; tables and emphasis checked visually. |
| Transcribe | Structure the same text in editable lesson JSON. | Source-to-JSON text comparison passes; all sections retained. |
| Typeset | Apply shared typography, tables and colored bands. | New selectable PDF generated without importing source pages. |
| Audit | Compare the source text with final PDF body; inspect bounds and glyphs. | No unexplained text differences or missing glyphs. |
| Visual QA | Open every page PNG at readable size. | No clipping, overlaps, awkward wraps, orphan headings, broken tables or inconsistent bands. |
| Deliver | Supply PDF, editable JSON and fidelity report. | State page count, checks passed, and any unresolved source concerns. |

## Sequential batch conversion

For repairing the previously generated set, use the
[PDF repair playbook](../../docs/materi-pdf-repair-playbook.md). Its composition,
proof and per-lesson acceptance steps are mandatory before promoting repaired
outputs. Preserve the corrected PBM 02/03 compositions as references.

`prepare_material_set.py` prepares the 15 LBE and 15 PBM editable lessons from
the source manifest. `batch_material_set.py` is the durable sequential runner:
it renders generated PDFs, audits all 30 source → lesson → rendered bodies,
checks each PDF with `inspect_pdf.py`, writes per-file fidelity reports, and
saves a machine manifest plus review sheets under `tmp/pdfs/material-final/`.
The full run regenerates 28 PDFs and reuses the PBM 02/03 canonical PDFs while
still inspecting and auditing all 30. Final PDFs stay in `output/pdf/LBE/` and
`output/pdf/PBM/`; original sources and the PBM 01 reference are left in place.

Run the representative proof first and visually compare it with
`output/pdf/PBM/pbm1-vecalss.pdf`. The PDF skill's operation marker is run once,
immediately before the first render:

```bash
./_harness/resource-guard.sh status
./_harness/resource-guard.sh run -- sh -c '
  node /Users/ravel/.codex/plugins/cache/openai-primary-runtime/pdf/26.915.20218/skills/pdf/container_tools/mark_artifact_operation_started.mjs \
    --operation-kind edit --expected-output-count 30 --output-format pdf &&
  /tmp/vecalss-pdf-venv/bin/python materi/_framework/selfcheck.py &&
  /tmp/vecalss-pdf-venv/bin/python materi/_framework/batch_material_set.py --proof
'
```

After reviewing proofs for LBE 01 and PBM 02, 03, 04, 05, 06, 09, 13 and 15,
run the complete sequential batch. Review every final rendered page before
marking the manifest as visually reviewed:

```bash
./_harness/resource-guard.sh status
./_harness/resource-guard.sh run -- /tmp/vecalss-pdf-venv/bin/python \
  materi/_framework/batch_material_set.py

./_harness/resource-guard.sh status
./_harness/resource-guard.sh run -- /tmp/vecalss-pdf-venv/bin/python \
  materi/_framework/batch_material_set.py --mark-visual-reviewed
```

The runner options are `--proof` (prepare and validate only LBE 01 and PBM 02,
03, 04, 05, 06, 09, 13 and 15, then render representative PDFs), `--prepare-only` (prepare editable lesson
JSON without rendering; only the proof selection when paired with `--proof`), and
`--mark-visual-reviewed` (mark all final pages reviewed after a successful
30-PDF fidelity run and manual page review). The aggregate manifest includes
subject, title, source pages, output path, page count, fidelity state and visual
review state. PBM tables are compared in exact row-major cell order after an
explicit source-layout reconstruction; there is no token-multiset fallback.
Every selected proof still passes exact source-to-editable and editable-to-
rendered character-order checks. PBM 05 page 11 reconstructs the split
comparison row as full cell 2 followed by full cell 3, preserving its bold and
italic spans without relaxing the ordered-text comparison. Source-preview
review confirmed table continuations at PBM 02 pages 3–4; PBM 03 pages 5–6 and
6–7; PBM 04 pages 1–2, 3–4 and 4–5; PBM 05 pages 9–11; PBM 06 pages
5–6; PBM 13 pages 7–8; and PBM 15 pages 2–3. The runner joins only these
explicitly reviewed adjacent page pairs with the same column count, matching
outer edges, and every internal divider within an absolute 2pt in PDF
coordinates (about three pixels at the reviewed preview scale). PBM 04 pages
3–4 and 4–5 and PBM 05 pages 9–10 and 10–11 use explicit
column-label mappings for visible width reflows; those mapped pairs check the
source labels and outer edges and bypass the general 2pt internal-divider
comparison. PBM 04 pages 6–7 are not a
continuation: page 6's three-column table ends before page 7 prose and a separate
two-column table. Row-level source pages stay with their rows through
pagination; repeated source headers are included as provenance on each output
chunk. Single-row header
fragments remain headers until joined to following data rows;
PBM 05's final continuation row appends its cell fragments to the preceding
row. PBM 09 page 2 has verified within-word line wraps in narrow cells
(including "Konjung|si" and "penamba|han"); those cells are reconstructed from
the source image and checked by exact ordered-text comparison. PBM 09's tables
on pages 2, 4 and 5 are otherwise separate; no tables appear in PBM 07–08,
10–12 or 14 in the reviewed previews. Unsupported tables outside the
2–4-column schema, table rows that cannot paginate intact, and single list
items that cannot retain hanging-list structure fail preparation instead of
being flattened into plain paragraphs. The proof manifest remains pending
until readable manual review; proof selection does not waive that gate.

## Editable format

See [`examples/pbm1.lesson.json`](examples/pbm1.lesson.json). The top-level fields
are `title`, `code`, `subject`, `source`, `verbatim: true`, and `pages`.
Each page has a stable `id`, its exact source `title`, `source_pages`, and `blocks`.
When a physical continuation starts without a source heading, use `title: ""`
and `continuation: true`. Do not invent a new instructional title to fill space.

| Block | Fields |
| --- | --- |
| `paragraph`, `heading`, `title` | Exact `text`; `title` is a prominent 26pt section title; optional `small: true` for supporting text |
| `table` | Exact `headers`, `rows`, optional positive relative column `widths`; two to four columns. Output-page splits repeat the source header using `synthetic_header: true`; this visual copy is excluded from source-text fidelity. |
| `bullets` | Exact `items`; original `marker` defaults to `•` |
| `steps` | Exact `items`; optional `start` and source-styled `item_labels` for original numbering |
| `question` | Original `id`, `prompt`, five `options`, original `labels` such as `abcde`; optional source-styled `question_label` and `option_labels` |
| `tip` | Exact original `title` and either `text`, `items`, or ordered `content` parts (`paragraph` / `bullets`); optional `tone: "warning"`; renders a mint callout with yellow icon (or thin yellow callout with dark green icon for warnings) |

`**bold**` and `*italic*` are layout markup; other markup is escaped. Newlines
join with spaces by default to remove extraction-only source wraps. Set
`preserve_line_breaks: true` on a block (or individual tip content part) only
for a meaningful source break such as verse, an address, or deliberately
separate examples, and record the exception in the preparation notes.
Use an empty-string header row on a source continuation only when no additional
header wording is available from the source. Renderer-created continuation
pages repeat the source header with `synthetic_header: true`, which keeps the
display context while source text is counted once. Page headers and footers are
navigation furniture, separate from the preserved lesson body.

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
[`examples/pbm1-fidelity.md`](examples/pbm1-fidelity.md). PBM 02 and PBM 03 are
manually composed, visually reviewed masters: preparation loads their canonical
lessons instead of reconstructing extraction fragments, and the full batch
audits their existing PDFs without rewriting either canonical file. PBM 03's
source header/data table spans the page 5–6 boundary and its summary table rows
span pages 6–7; its direct composition is the reviewed source for those joins.
Tool references:
[ReportLab font families](https://docs.reportlab.com/reportlab/userguide/ch3_fonts/)
and [tables](https://docs.reportlab.com/reportlab/userguide/ch7_tables/).
