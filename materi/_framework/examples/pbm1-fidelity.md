# PBM 01 formatting and fidelity record

The user requires the **same material verbatim**. The output changes typography,
spacing, tables, pagination and Vecalss branding only. Earlier editorial paraphrases
and content corrections are superseded and are not part of the delivered example.

| Item | File |
| --- | --- |
| Original | `materi/pbm1.pdf` (12 pages) |
| Original text snapshot | `pbm1.source.txt` |
| Checked layout recipe | `prepare_pbm1.py` |
| Editable typesetting source | `pbm1.lesson.json` |
| Designed PDF | `output/pdf/pbm1-vecalss.pdf` |
| Character fidelity report | `output/pdf/pbm1-fidelity.json` |

Source SHA-256: `1c267d58bce6823fcd32fd65e6ac326b4dc414e947bd15211c5a1b554961d85e`.

## Preservation contract

All sections A-G, original claims, all table cells, four questions, all options,
their original answers and explanations, the Veco tips and common mistakes remain
in source order. Possible content concerns are not corrected inside the PDF.
Original punctuation, including the en dash and emoji, is retained. The source's
answer emphasis and the bold words referred to by question 2 are kept.

The layout recipe consumes the extracted source sequentially and rejects unknown
or unconsumed content. New text is drawn on a fresh PDF canvas; source pages are
never imported or used as backgrounds. The source snapshot includes extraction
page markers; they are not lesson text and do not appear in the designed PDF.

## Formatting decisions

- A4 portrait, readable Manrope/Plus Jakarta Sans type, consistent margins.
- Full-width Voyage Deep top and bottom bands with Sea-Glass inner accents.
- Rebuilt tables with mint headings and consistent padding.
- New page breaks at section boundaries; table continuations retain the source
  order. No invented headings are inserted on continuation pages.
- Noto symbol and emoji fonts preserve source characters missing from the brand
  fonts; their open-font licenses are included.

## Verification

`check_fidelity.py` compares the original PDF's complete extracted text with both
the JSON lesson text and the new PDF body. Only layout whitespace, zero-width
extraction artifacts and emoji presentation selectors are normalized. Spelling,
case, punctuation, numbers, markers and order must match.

The final page count, comparison outcome and visual QA are recorded in the
`vecalss-learning-pdf-framework` Traycer artifact. Automated checks must be followed
by inspection of every latest page image. No claim of factual editing, exhaustive
dictionary checking, PDF/UA certification or print-shop color certification is made.
