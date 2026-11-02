# Repairing the LBE and PBM lesson PDFs

Use this procedure when an existing conversion contains source-width lines,
ragged prose, broken lists, isolated tips, incorrect table headers or sparse
intermediate pages. The requested result is the same complete material in the
checked PBM 02/03 formatting. Follow `materi-pdf-workflow-guide.md` for design,
fidelity and resource rules.

## Scope and ownership

- Inventory 15 LBE and 15 PBM lesson PDFs. Keep LBE/PBM folders and filenames.
- Preserve the reviewed PBM 02 (10 pages) and PBM 03 (12 pages) JSON/PDF files.
  Audit them as references; repair the other 28 lesson outputs. Preserve the
  separate `output/pdf/PBM/pbm1-vecalss.pdf` historical reference as well.
- One worker owns LBE editable compositions; another owns PBM 04–15 editable
  compositions. A single tools owner controls shared Python files and every
  guarded extraction/render/audit command. It also handles PBM 01 from its
  existing reviewed master. Composition workers must not edit shared tools or
  start competing render jobs. They may read files, inspect existing images and
  author their own lesson JSON or deterministic per-lesson recipes.
- The coordinator owns this playbook, acceptance decisions and final delivery.
  Do not commit or change unrelated files during this repair.

## Exact repair sequence

1. **Freeze the references and inventory.** Record source PDF/page ranges,
   canonical editable path, existing output path and review state per lesson.
   Read the corrected PBM 02/03 JSON and final page previews before composing.
2. **Extract once for the whole repair set.** In one sequential guarded command,
   save source page images, text and styled source spans under
   `tmp/pdfs/material-repair/source/`. Include table bounding boxes, actual row
   cells and source page numbers. This stage must not depend on the old batch
   paginator or its table-continuation allowlist succeeding. Report independent
   source failures per lesson and retain successful evidence.
3. **Read every source page.** Use its image to identify paragraph, list, heading,
   option, table and callout boundaries. Existing line-fragment JSON is only an
   extraction aid. It is not the approved structure merely because text matches.
4. **Write a semantic composition.** Join consecutive layout lines into complete
   source paragraphs, including continuations across source pages. Preserve real
   paragraph breaks, all wording, punctuation and order. Recognize headings by
   source structure. A short answer or acronym is not a heading. Do not decide
   paragraph boundaries solely from capitalization or terminal punctuation.
5. **Rebuild complete lists and choices.** Join wrapped continuation lines into
   their original item. Use hanging indents and compact PBM 02 spacing. Preserve
   original numeric/letter markers, including their bold/italic style. Slice
   styled text using visible-character/style maps, never raw Markdown offsets.
   Identify numbered-item boundaries from source lines and item headings, not
   the first matching number anywhere in prose: `Penulis Teks 2.` is body text,
   not the start of item 2. Check the number/heading association visually;
   flattened text equality alone cannot detect this structural error.
6. **Rebuild tables from the visible cells.** Keep native selectable rows/cells
   and sensible column widths. A header-only fragment followed by data is one
   table; a data row at the top of the next source page is not a new header.
   Inspect cross-page continuations explicitly. Join only documented matching
   tables/row fragments; keep distinct neighboring tables distinct. Read-order
   errors from extraction must be resolved from the source image, not preserved
   as interleaved words. Record source pages per row/chunk. Repeated output
   headers are synthetic navigation and must be explicitly accounted for in
   fidelity; never use unordered token equality as the acceptance test.
   Keep independent transcripts page-first even when a row continues across
   source pages. For PBM05 p10–11, the runner uses the independently reviewed,
   source/transcript-hash-pinned five-fragment map to derive complete cell order.
   It requires unique exact fragments in their declared pages, no overlap or
   interleaved text, and consumes each fragment once. All text outside that row
   stays in order. The original transcript is unchanged; audits retain the map,
   positions and original/derived stream digests. This map is included in the
   stable review digest checked through candidate rendering and promotion.
7. **Restore emphasis from original spans.** After regrouping, map each visible
   label and its body in reading order to the source style stream. Preserve bold,
   italic and combined emphasis in paragraphs, examples, table cells, prompts,
   correct-answer choices and markers. Plain-text fidelity does not verify style.
8. **Compose pages at the approved type sizes.** Measure the actual flowables on
   a canvas. For `KeepTogether`, measure its children/actual height rather than
   its forced-split sentinel. Keep section headings with meaningful content,
   questions with choices and complete table rows. Fit related sections together
   when readable; investigate large empty intermediate pages. A full table or
   coherent question can justify its own page. Never shrink body type to force
   a page count. Keep page-anchor titles plain text; inline emphasis belongs in
   rendered content, not in the title comparison key.
   Read the last block on every page before rendering: a section heading or a
   bold lead-in ending in a colon must stay with its list, table or question.
   Move that label to the following page when the complete section cannot fit.
   Join short table-only continuation pages when the full table fits with its
   original column headers; preserve every row/cell in source order.
9. **Group the closing material.** Render the Veco Tips section title prominently,
   both/all consecutive tips as mint panels with yellow icons, and common
   mistakes as pale-yellow panels with dark-green icons. Put the callouts on one
   closing page when they fit at the approved sizes. Otherwise keep tips together
   and the warning together on the next page, as in PBM 03. Do not allocate a
   separate page to each short tip or to its title alone.
10. **Preflight every composition before rendering.** Check exact ordered source
    text versus authored text, source coverage, valid block schema, paragraph
    structure, label style and estimated page heights. Collect all failures in a
    per-lesson report in the same command. Do not repeatedly launch an all-set
    job that stops at the first unrelated extraction problem.
    Stage `NN-<slug>.source-order.txt` beside each composition as the source
    transcript. Prefer the original content-stream text when its order agrees
    with the images. When extraction order differs from visible reading order,
    construct and verify the transcript independently from original page, span
    and table-cell evidence; document the exact page/row/cell reconciliation in
    the lesson's review notes. Never create the reference transcript merely by
    flattening the staged lesson JSON. Check source-to-transcript integrity and
    complete page/row/label coverage before the exact transcript-to-lesson
    comparison. Reject unexplained wording, punctuation or coverage differences.
    `SourceComposer` consumption methods advance a source cursor: call `take`,
    `paragraph`, `heading`, labelled-item and split methods in source order,
    then assemble the already-consumed blocks into semantic groups. Building
    the final list in order does not repair earlier out-of-order method calls.
    Visual confirmation of source reading order remains mandatory; an unordered
    word count cannot establish that order.
    Inspect every entry in the report's `all_differences`, not just the first
    error excerpt. Verify quotation glyphs, list markers and spaces after slashes
    against the source; preserve bold/italic separately from exact text equality.
    For regular source question prompts use `prompt_bold: false`; mark correct
    answer labels explicitly in `option_labels` when their source marker is bold.
11. **Render candidates and inspect them.** Build staged PDFs in
    `tmp/pdfs/material-repair/candidates/` using the shared renderer. Fully
    justify body/explanations/passages/lists/options/callout text, with natural
    final-line spacing. Headings/narrow table cells retain the reference left
    alignment. Keep Learning Academy removed. Retain the green header/footer
    and yellow edge accents outside the content frame with at least 12pt
    clearance. Audit exact source → editable → rendered text and bounds/glyphs.
    Open every final page image at readable size.
    Use the manifest's candidate-hash-specific `page_images` paths; reused render
    work paths can show stale cached images. The runner preserves review snapshots
    under `review-snapshots/<subject>/<filename>-<candidate-sha>/` and records PNG
    hashes. Never sign off an image from an earlier candidate at a reused path.
    Compare structure, emphasis, tables, hanging indents, justification, callout grouping and page rhythm
    against PBM 02/03. Review actual paragraphs; a `TA_JUSTIFY` setting alone is
    insufficient. Record concrete defects and fix compositions before promotion.
12. **Promote only accepted lessons.** Copy each audited, visually accepted
    candidate and its editable JSON to the stable subject path. Record the final
    PDF checksum and per-lesson source/fidelity/page/visual-review result. Keep
    pending or failed lessons explicitly pending; report the completed counts
    honestly. Never mark an entire manifest reviewed before every page has been
    inspected. Do not rerender the reviewed PBM 02/03 masters during promotion.

## Budgeted execution and handoffs

For this repair job, plan at most six normal guarded command groups in total,
with at most three per tools-owner turn: (1) source evidence, (2) complete-set
composition preflight, (3) candidate render/audit, (4) targeted corrections if
needed, (5) final audit/promotion, (6) necessary reserve. These are budget
allocations, not instructions to run stages unnecessarily. Check status before
each launch; serialize every command through `_harness/resource-guard.sh`.
Use the existing PDF venv and run the PDF operation marker exactly once before
the first authoring/render command for this job. No emergency mode, parallel
process farms, busy retries or resetting the budget by spawning another worker.
Read/search/diff/image inspection and ordinary file edits do not consume CPU
launch groups. Request an extension only if the actual shared budget is spent,
after reading failures and preparing concrete fixes.

Composition-worker brief:

> Use `traycer-implement` and the PDF skill. Repair every assigned lesson using
> `docs/materi-pdf-repair-playbook.md` and the corrected PBM 02/03 examples.
> Inspect all source images, author complete semantic paragraphs/lists/choices,
> rebuild source tables and preserve wording, order and all emphasis. Own only
> your subject's staging compositions/recipes and review notes. Coordinate with
> the single tools owner for extraction and rendering. Do not edit shared tools
> or run scripts yourself. Inspect every rendered candidate page, report
> per-lesson acceptance or specific defects, then hand accepted files to the
> coordinator for promotion. No content rewriting or commit.

Tools-owner brief:

> Own only the shared repair runner, source evidence and serialized guarded
> commands. Follow the six-group shared job budget and the playbook. Provide
> composition workers source images/text/spans, accept their reviewed editable
> structures directly and do not replace them with the old automatic paginator.
> Preflight all lessons independently, stage candidates, audit ordered text,
> publish per-lesson evidence and promote only after readable page review.
> Preserve PBM 02/03 masters and the historical PBM 01 reference. Coordinate
> explicit phase messages with both composition workers; no speculative retries.
