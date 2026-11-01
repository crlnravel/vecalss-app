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
| [`materi/_framework/prepare_material_set.py`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/prepare_material_set.py) | Deterministic preparation and pagination for the 15 LBE and 15 PBM lesson JSON files |
| [`materi/_framework/batch_material_set.py`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/batch_material_set.py) | Sequential render, source/lesson/PDF fidelity audit, per-PDF reports, review sheets and aggregate manifest |
| [`materi/_framework/inspect_pdf.py`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/inspect_pdf.py) | Source extractor, page PNG/contact-sheet rasterizer, and bounds/glyph/round-trip auditor |
| [`materi/_framework/check_fidelity.py`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/check_fidelity.py) | Strict character-and-word-boundary verifier comparing source PDF, editable JSON, and rendered PDF body |
| [`materi/_framework/selfcheck.py`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/selfcheck.py) | Automated regression suite for validation, overflow rejection, PTN Pro header, justified text, list geometry, and UTF-16BE symbol encoding |
| [`materi/_framework/requirements.txt`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/requirements.txt) | Python dependencies (`reportlab`, `pymupdf`, `pillow`) installed in an isolated venv |
| [`materi/_framework/assets/`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/assets) | Brand illustrations and mascot artwork (`mascot-veco.png`, `mascot-veco-2.png`, `logo-mark.png`) |
| [`materi/_framework/fonts/`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/fonts) | Embedded TTF fonts (`Plus Jakarta Sans`, `Manrope`, `Sports World`, `Noto Emoji/Symbols/Math`) |
| [`materi/_framework/examples/prepare_pbm1.py`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/examples/prepare_pbm1.py) | Reference deterministic recipe slicing `pbm1.source.txt` into `pbm1.lesson.json` |
| [`materi/_framework/examples/pbm1.lesson.json`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/examples/pbm1.lesson.json) | Complete editable lesson JSON example for PBM 01 |
| [`materi/_framework/examples/pbm1-fidelity.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/examples/pbm1-fidelity.md) | Provenance, formatting decisions, and verification record for PBM 01 |
| [`output/pdf/PBM/pbm1-vecalss.pdf`](../output/pdf/PBM/pbm1-vecalss.pdf) | Saved 16-page PBM 01 visual reference; apply the later removal of Learning Academy to new outputs |

---

## 2. Copyable Agent Prompt

For repairing the existing LBE/PBM set to the corrected PBM 02/03 standard,
follow the [PDF repair playbook](materi-pdf-repair-playbook.md). It specifies
source inspection, semantic regrouping, styled labels, cross-page tables,
pagination, independent lesson preflight, readable page review and delegated
ownership. Use reviewed compositions directly; the old automatic extraction
and pagination path does not establish tidy formatting.

For several lessons or source documents, use the delegated batch workflow below instead of issuing a separate conversion turn for each PDF.

### Delegated batch workflow and PBM 01 visual reference

The approved visual reference is `output/pdf/PBM/pbm1-vecalss.pdf`, with editable structure in `materi/_framework/examples/pbm1.lesson.json`. Historical page previews live in `tmp/pdfs/pbm1-final/`; verify their correspondence to the reference PDF before using them. The explicit later instruction to remove **Learning Academy** applies to every new output: retain `PTN PRO` and the mascot, without that subtitle or metadata suffix.

**Full justification and paragraph reconstruction — mandatory acceptance gate**

PBM 02 is a checked example of this gate: `materi/_framework/examples/PBM/02-makna-kata-frasa.lesson.json` renders to `output/pdf/PBM/02-makna-kata-frasa-berlian-ptn-pro.pdf` (10 pages). Its paragraphs and hanging lists were composed from complete source passages; source font spans were reapplied to preserve bold/italic text and answer labels. Both tips and the warning share the closing page. All 12,128 normalized source characters match in order, and every final page was inspected at readable size. Treat both files as canonical: preparation must load the reviewed lesson structure directly, and a full batch may audit the existing PDF but must not rewrite either PBM 02 file. Do not replace the composition with line-by-line extraction simply because flattened text still matches. PBM 01 remains the header/footer design reference, with the later accent-clearance and Learning Academy removal instructions applying.

PBM 03 is also manually composed and reviewed: `materi/_framework/examples/PBM/03-morfologi-pembentukan-kata.lesson.json` and `output/pdf/PBM/03-morfologi-pembentukan-kata-berlian-ptn-pro.pdf` (12 pages; 15,371 normalized source characters match in exact order). Preparation must load this canonical lesson directly, and a full batch may audit the existing PDF but must not rewrite either file. The source has 12 pages, including a final warning bullet on page 12. Its 15-row summary is a single table in the output; the two tips share a page, with the longer common-mistakes panel on the next page at the approved font size. Table headers and data were reconstructed from the source images and source font spans, including the table header at the bottom of source page 5 and its data on page 6. Text-only equality is insufficient to authorize replacing these reviewed paragraphs with source-width lines.

- Fully justify body paragraphs, explanations, reading passages, supporting text, tip/callout body text, bullet items, numbered steps and answer options. Use `TA_JUSTIFY` throughout these styles. Each complete line should meet both text edges; a paragraph's final line and single-line items retain natural spacing. Do not stretch the final line or insert manual spaces to fake alignment.
- Reconstruct each semantic paragraph before typesetting. Join extraction-only line wraps with normal spaces, preserving every word, punctuation mark, emphasis span and word boundary. Do not turn each extracted line into a separate paragraph, since every line would then be treated as a short final line.
- Remove extraction-only hard breaks from prose before passing it to `rich()`. The renderer joins newlines with spaces by default so a source-width wrap cannot become a ragged forced line. Set `preserve_line_breaks: true` only for a source break that carries meaning, such as verse, an address or deliberately separate examples, and record the exception. Reconstruct list items and answer options as complete items before rendering; keep only meaningful source paragraph/list boundaries.
- Keep titles, headings, furniture and narrow table cells left aligned under the existing PBM 01 styles. Keep hanging indents for justified lists and options; wrapped lines must align with the item text, with compact spacing between items.
- Verify the rendered result at readable size on representative multiline prose, explanations, lists, options and callouts from both LBE and PBM, then check every final page. Reject ragged multiline prose caused by extraction breaks, one-line paragraph fragmentation, or a left-aligned body style. Also reject wide word gaps caused by incorrect paragraph reconstruction; fix the structure rather than reducing the approved font size. A style flag or text-fidelity pass alone does not satisfy this gate.

Include this instruction in every subagent handoff: **Fully justify all prose and list/option/callout bodies; reconstruct complete semantic paragraphs from source wraps, and visually confirm both text edges in the final PDF.**

**Required design and pagination contract**

- Match PBM 01's header and footer dimensions, mascot/wordmark placement, rounded clipped green accents and single diagonal header accent. Do not replace its curved accents with extra angular stripes. Keep the soft borderless yellow circle at the top right and diagonal wash at the bottom left entirely clear of the content frame: leave at least 12pt between the circle and the right text edge, and end the wash at least 12pt left of the left text edge. Clip partial shapes at page edges as before.
- Keep A4, 48pt side margins, a content frame 82pt from the top and 65pt from the bottom, and PBM 01's existing body, heading, table and hanging-list styles. Preserve source bold/italic emphasis where it carries instructional meaning.
- Reconstruct paragraphs from complete sentences and semantic source blocks. A PDF extraction line break is not automatically a new paragraph or heading. Choice labels, short answers and acronyms must not become headings merely because they are short or bold.
- Compose logical pages deliberately, as in the PBM 01 recipe. Keep a heading with the content it introduces, a question with its choices where feasible, and table rows intact. Allow ordinary text to flow naturally; avoid breaking a paragraph merely to fill a fixed block count.
- Keep the Veco Tips section title prominent and group consecutive tips and the common-mistakes panel on a shared page when they fit, as in PBM 01's closing page. Never force one short tip per page. Use mint with a yellow bulb for tips; pale yellow with a dark-green warning icon for common mistakes; no circles behind icons.
- Treat sparse intermediate pages as a layout issue to investigate. Reflow adjacent related content when it fits at the approved type size. A short closing page is acceptable when the lesson ends; adding content, changing wording or shrinking type to hit a page count is forbidden.
- Keep each material as its own PDF, with LBE and PBM in separate output and editable-source directories. Keep the existing descriptive filenames stable. Preserve reference PDFs and original downloads.

**Delegation and ownership**

1. The coordinator records the source files, material boundaries, reference PDF, output paths and acceptance criteria in the handoff. Update this guide before assigning a new batch workflow.
2. Assign one implementation subagent ownership of the shared renderer and batch entry point, using the repository's configured model. Brief it to read `materi/AGENTS.md`, this guide, the framework README, PDF skill and `traycer-implement` skill. Other agents may prepare distinct subject manifests, but must not edit the shared renderer or launch overlapping render jobs.
3. Use a durable batch entry point under `materi/_framework/` to prepare, render and audit the whole manifest sequentially. Temporary scripts under `tmp/pdfs/` are working evidence, not the reusable delivery mechanism. One guarded command group can contain several sequential stages; it must not create parallel process farms.
4. Check the resource guard before launches and follow its normal thresholds and launch budget. This workflow does not grant emergency mode or additional launches. Stop after a resource refusal and report the snapshot; never loop retries or bypass the guard.
5. Produce and inspect representative LBE and PBM proofs against PBM 01 before running the complete batch with the same styles. Include a first page, dense body/list/table page, question page and closing callouts. For PBM 05, inspect the bold `b.` answer label and its body emphasis at readable size; exact text comparison strips emphasis markers and cannot certify style preservation. This is the subagent's visual acceptance gate; user approval is only needed if a design decision remains unresolved.
6. Audit every final PDF against its source and editable text, then inspect all final rendered pages. Compare visual structure, source emphasis and reading rhythm explicitly; a text-fidelity pass or contact-sheet count cannot certify the design. Review questionable pages individually at readable size.
7. Return a manifest with subject, lesson, source page range, output PDF, page count, fidelity result and visual-review status, plus any exceptions. State the number of PDFs completed per subject, changed framework files, commands launched and unresolved issues. The coordinator reports only verified completion.

**Durable batch invocation**

Run each stage sequentially from the repository root. Check the resource guard
before each launch. The PDF skill operation marker is required once, immediately
before the first render; it declares the 30-PDF final output count even though
the first render is a representative proof:

```bash
./_harness/resource-guard.sh status
./_harness/resource-guard.sh run -- sh -c '
  node /Users/ravel/.codex/plugins/cache/openai-primary-runtime/pdf/26.915.20218/skills/pdf/container_tools/mark_artifact_operation_started.mjs \
    --operation-kind edit --expected-output-count 30 --output-format pdf &&
  /tmp/vecalss-pdf-venv/bin/python materi/_framework/selfcheck.py &&
  /tmp/vecalss-pdf-venv/bin/python materi/_framework/batch_material_set.py --proof
'

# Inspect the representative proof pages against PBM 01 before proceeding.
./_harness/resource-guard.sh status
./_harness/resource-guard.sh run -- /tmp/vecalss-pdf-venv/bin/python \
  materi/_framework/batch_material_set.py

# After manually inspecting every final page, update the manifest status.
./_harness/resource-guard.sh status
./_harness/resource-guard.sh run -- /tmp/vecalss-pdf-venv/bin/python \
  materi/_framework/batch_material_set.py --mark-visual-reviewed
```

Use `--prepare-only` to regenerate editable lesson JSON without rendering.
`--proof` prepares and validates only LBE 01 and PBM 02, 03, 04, 05, 06, 09,
13 and 15, then renders their outputs under `tmp/pdfs/material-proofs/`. This
set includes the page-edge table continuations and wrapped-cell reconstruction,
as well as the visual reference subjects. Each selected proof still receives the same
exact source-to-lesson and lesson-to-rendered-text checks as a full batch;
unrelated lesson failures do not block preparing the proof. The default command
prepares and validates all 30 materials, writes the 28 regenerated PDFs to their
stable paths in `output/pdf/LBE/` and `output/pdf/PBM/`, and reuses the existing
PBM 02 and PBM 03 master PDFs without rewriting them. It writes per-PDF fidelity
reports and `tmp/pdfs/material-final/manifest.json` for all 30 materials. The
final manifest starts with
visual review pending. Only run `--mark-visual-reviewed` after every page in
the final output has been inspected. PBM table order is verified against exact
row-major source cells reconstructed from the visual layout, not a word-token
multiset. PBM 05 page 11 explicitly reconstructs its split comparison-row cells
in visible reading order: the full "SEBAGIAN ... lebih banyak." continuation
precedes the full "persediaan ... BBM." continuation. The exact ordered-text
comparison remains enabled for this correction. Source-preview review confirmed
table continuations at PBM 02 pages 3–4; PBM 03 pages 5–6 and 6–7; PBM 04 pages
1–2, 3–4 and 4–5; PBM 05 pages 9–11; PBM 06 pages 5–6; PBM 13 pages 7–8;
and PBM 15 pages 2–3. These fragments are joined only for explicitly reviewed
adjacent page pairs with the same column count, matching outer edges, and each
internal divider within an absolute 2pt in PDF coordinates (about three pixels
in the 857px-wide source previews). PBM 04
pages 3–4 and 4–5 and PBM 05 pages 9–10 and 10–11 use explicit column-label
mappings because the visible source tables reflow their column widths; these
mapped pairs validate the labeled columns and outer edges and bypass the general
2pt internal-divider comparison. PBM 04
pages 6–7 are not a continuation: page 6's three-column table ends there, and
page 7 starts with prose followed by a separate two-column table. Single-row header fragments
are retained as headers until joined to the following data rows; PBM 05's final
continuation row appends its cell fragments to the preceding row. If an output
table must split between logical pages, repeat its display header and mark that
copy synthetic so exact source-text fidelity counts the original header once.
Row-level source pages are retained through table assembly and pagination so
each output logical page records only its contributing source rows plus any
repeated source header.
PBM 05's legacy editable source is replaceable only when the two documented,
unique reading-order corrections produce an exact whole-lesson match; PBM 09's
legacy source is replaceable only when its six documented within-word spaces
produce the same exact whole-lesson match. PBM 09 page 2
has visible within-word wraps in narrow cells (including "Konjung|si" and
"penamba|han"), which are reconstructed from the source image as whole words
and checked with exact ordered-text comparison. PBM 09's tables on pages 2, 4
and 5 are otherwise separate; PBM 07–08, 10–12 and 14 have no tables in the
inspected page previews.

Do not flatten unsupported structures as a recovery path. Tables beyond the
2–4-column schema, table rows too tall to paginate intact, or a single list item
too tall to retain its hanging-list structure must fail preparation with a
specific error until an explicit structural pagination rule is added. The
proof's manual visual review gate remains required before the full batch.

Copy this handoff, filling the source and output paths:

> Use `traycer-implement` and the PDF skill. Own the batch conversion described in `docs/materi-pdf-workflow-guide.md`, including the shared renderer and durable batch runner. Retypeset all lessons in the supplied LBE/PBM manifest verbatim, preserving semantic paragraphs, lists, tables, questions, choices, emphasis and order. Match `output/pdf/PBM/pbm1-vecalss.pdf`'s header/footer geometry and page rhythm, while keeping Learning Academy removed. First inspect representative proofs side by side with PBM 01, then regenerate the complete set sequentially under the resource guard. Keep outputs in `output/pdf/LBE/` and `output/pdf/PBM/`, with stable filenames and separate editable sources. Audit text and visually inspect every final page; report the per-lesson manifest and concrete exceptions. Preserve unrelated work and the original reference assets. Do not commit unless requested.

Use this prompt whenever you want an agent to convert another module PDF (such as `materi/pbm2.pdf`):

> Retypeset `materi/<source>.pdf` using `docs/materi-pdf-workflow-guide.md` and `materi/_framework/README.md`. Keep the original material verbatim: all wording, headings, examples, tables, questions, choices, answer keys, explanations, tips, symbols, punctuation, and sequence. Build fresh selectable text and tables; never overlay or embed original PDF pages. Apply PTN Pro branding with the mascot header logo, justified body text, borderless soft light-yellowish background accents (a top-right circle and a bottom-left diagonal band), leaving at least 12pt between each accent and the text frame, hanging list indents, highlighted Veco Tip and common-mistakes callouts, and colored top/bottom bands on every page. Compare the original text with both the editable source and final rendered body using `check_fidelity.py`. Inspect every final page visually using `inspect_pdf.py`. Deliver the PDF (`output/pdf/<slug>-vecalss.pdf`) and editable source (`materi/_framework/examples/<slug>.lesson.json`), with a short fidelity/formatting report. Flag possible content issues separately without changing them unless I explicitly authorize content editing.

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
| `"steps"` | `items` *(string[])* | `start` *(int, default `1`)*, `item_labels` *(styled source labels)* | Justified (`TA_JUSTIFY`) numbered list with source number-marker emphasis retained; uses the same hanging indent and compact item spacing. |
| `"table"` | `headers` *(string[])*, `rows` *(string[][])* | `widths` *(number[])*, `synthetic_header: true` *(generated continued-page display copy)* | 2-to-4 column table with left-aligned (`TA_LEFT`) cells, mint header row (`#EEF8F1`), and padded cells. Use empty headers for a source continuation with no source header; generated table splits repeat the source header for context, mark it synthetic, and exclude that display copy from source-text fidelity. |
| `"question"` | `id` *(string)*, `prompt` *(string)*, `options` *(5 strings)* | `question_label`, `option_labels` *(styled source labels)*, `labels` *(string, default `"ABCDE"`)* | Keeps question prompt and all 5 options together on one page (`KeepTogether`), retaining source emphasis on the question and option labels with justified hanging-indented options. |
| `"tip"` | `title` *(string)*, and `text` *(string)*, `items` *(string[])*, or ordered `content` *(paragraph / bullet parts)* | `marker` *(string, default `"•"`)*, `tone` *(string, e.g. `"warning"`)* | Highlighted callout block with no background circle behind the icon: Veco Tips use a Sea-Glass Wash (`#EEF8F1`) panel with a yellow (`#E8AD16`) `💡` icon; `Kesalahan Umum` (`tone: "warning"`) uses a soft light-yellowish (`#FFF7D6`) panel with a dark green (`#014C38`) `⚠️` icon. |
| `"note"` | `title` *(string)*, `text` *(string)* | — | Compact bounded teaching note on a mint surface with justified supporting text. |
| `"references"` | `items` *(`{label, url}`[])* | — | External `https://` reference links styled in Voyage Deep. |

### Inline Markup

Inside any `text`, `title`, `prompt`, `question_label`, `option_labels`, `item_labels`, `items`, `options`, `headers`, or `rows` string:
- `**bold text**` renders as bold (`Jakarta-Bold`).
- `*italic text*` renders as italic (`Jakarta-Italic`).
- Newlines are joined with spaces by default to remove extraction-only line wraps. Add `preserve_line_breaks: true` to the containing block (or individual tip content part) only when the line break is semantically intentional; those retained `\n` characters render as `<br/>`. Record meaningful exceptions in the lesson's preparation notes.
- All XML/HTML special characters (`<`, `>`, `&`) are automatically escaped.
- Unicode symbols (`→`, `↔`, `≠`, `≥`, `●`, `•`) and emojis (`🦆`, `💡`, `⚠`) are automatically routed to the embedded `NotoSymbols`, `NotoMath`, or `NotoEmoji` fonts.

---

## 6. Visual Design & Layout Rules

The renderer pulls color tokens directly from [`DESIGN.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/DESIGN.md).

- **Page Geometry:** A4 portrait (`595.27pt × 841.89pt`), `48pt` left/right margins, content frame starting `82pt` from top and ending `65pt` from bottom.
- **Top Band (`62pt` high, borderless):** Full-width Voyage Deep (`#014C38`) with borderless clipped geometric accents (one forest circle, one leaf diagonal ribbon), mascot logo (`mascot-veco.png`), `PTN PRO` wordmark, and right-aligned subject code (`PBM`).
- **Bottom Band (`47pt` high, borderless):** Full-width Voyage Deep (`#014C38`) with one borderless clipped forest circle, left-aligned subject name (`Pemahaman Bacaan & Menulis`), and right-aligned plain page number (`1`, `2`, ...).
- **Borderless Light-Yellowish Background Shapes:** Clipped to the reading canvas (`y: 47pt..H-62pt`) behind all text and tables: borderless (`stroke=0`, `fill=1`) soft light-yellowish (`#FFF7D6`) accents consisting of one circle on the top right and one diagonal band on the bottom left.
- **Text Alignment:** Body paragraphs, tip text, supporting text, bullet items, numbered steps, and multiple-choice options are justified (`TA_JUSTIFY`). Page titles, section headings, and table cells remain left-aligned (`TA_LEFT`).
- **Hanging Lists & Options:** Bullet items, numbered steps, and multiple-choice options place their text in front of the dot/number (`bulletIndent: 6pt`, `leftIndent: 24pt`) so wrapped continuation lines align cleanly with the first line's text rather than wrapping underneath the marker. Consecutive items use `15pt` leading and `3pt` spacing (`10pt` after the final item).
- **Veco Tips & Common Mistakes (`Kesalahan Umum yang Sering Terjadi`):** Both use `tip` callout panels with no circle behind the icon. Veco Tips use a `sea-glass-wash` (`#EEF8F1`) panel with a yellow (`#E8AD16`) `💡` icon; `Kesalahan Umum yang Sering Terjadi` (`tone: "warning"`) uses a thin yellow (`#FFF7D6`) panel with a dark green (`#014C38`) `⚠️` icon.

---

## 7. Reference Example: PBM 01 (`materi/pbm1.pdf`)

PBM 01 (`MATERI 01 — Ejaan & Tanda Baca`) is the reference implementation:
- **Source:** `materi/pbm1.pdf` (`12` pages, SHA-256 `1c267d58bce6823fcd32fd65e6ac326b4dc414e947bd15211c5a1b554961d85e`)
- **Output:** [`output/pdf/pbm1-vecalss.pdf`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/output/pdf/pbm1-vecalss.pdf) (`16` pages)
- **Fidelity Check:** `16,260 / 16,260` normalized characters matched (`13,896 / 13,896` non-whitespace characters matched) across both `source_to_editable_lesson` and `source_to_rendered_body`.
- **Detailed Provenance:** [`materi/_framework/examples/pbm1-fidelity.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/materi/_framework/examples/pbm1-fidelity.md).
