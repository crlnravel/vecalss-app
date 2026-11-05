# Vera AI

Vera is the learner's AI tutor at `/vera-ai`. It answers from the student's own
released learning data and from PTN Pro's published Materi, and it writes
Studio documents. Answers come from OpenAI through the Responses API, and every
answer is billed in credits.

## What a student gets

- **Chat.** Answers stream in. The effort menu trades depth for credits:
  Cepat, Seimbang, or Mendalam (see [Credits](#credits)).
- **`@` mentions.** Type `@` to pin a Materi, Kuis, Tryout, or Studio document
  into a message. A message carries at most five sources, and the pinned text
  stays within a fixed token budget. A source the student may not read is
  refused and the chip says so.
- **Sessions.** A sidebar lists the student's sessions, newest first. A session
  can be renamed, archived, or deleted. The first question names the session,
  with the first answer as extra context when it was saved, so a stopped first
  answer still gets a title.
- **Studio.** Three tools write a saved document with its sources and its
  credit charge: Analisis Kelemahan, Rute Belajar 7 Hari, and Bahas Soal Salah.
  "Tanya Vera soal ini" pins a document into a new chat message.
- **Usage.** Each answer shows what it cost. The usage popover shows the
  student's day, week, and month.

## Environment

| Variable | Read by | Meaning |
| --- | --- | --- |
| `OPENAI_API_KEY` | Server | Enables real answers. Without it Vera answers `503 vera_unavailable`. With it, local development calls the real OpenAI API and bills the account. |
| `VERA_OPENAI_MODEL` | Server | Model id. Defaults to `gpt-6-luna`. |
| `VERA_MOCK_MODEL=1` | Dev server | Local stand-in that streams sample text and never reaches the network. It is honored only when `NODE_ENV` is not `production`. Production ignores it. |
| `OBSCURA_CDP_TOKEN` | Tests | Bearer token for an Obscura server that requires one. |

## Credits

Prices, in micro-USD per token: input 0.10, cached input 0.01, output 0.50.

```
cost (micro-USD) = noCacheInput x 0.10 + cachedInput x 0.01 + output x 0.50
credits          = cost / 2,350, rounded up to 0.1
```

One credit is USD 0.00235. Before a request the effort's reserve is held, and
the settled charge replaces it. A completed step is charged what the provider
reported. A run that was stopped or failed is charged its completed steps plus
an estimate for the step that was cut off: its input, and the output it streamed
at about four characters a token. A run that streamed nothing is released and
charged nothing. A reservation that never settles, for example after a server
crash, is released after ten minutes, free.

| Effort | Reasoning | Output cap | Reserve | Ceiling |
| --- | --- | ---: | ---: | ---: |
| Cepat | low | 1,500 | 2 | 4 |
| Seimbang | medium | 3,000 | 3 | 6 |
| Mendalam | high | 6,000 | 5 | 10 |

Studio always runs at Mendalam. The ceiling caps what one answer can cost.

## Limits

Windows are calendar windows in Asia/Jakarta (WIB).

| Window | Soft (warning) | Hard (refused) |
| --- | ---: | ---: |
| Day | 10 credits | 15 credits |
| Week (Monday to Sunday) | 70 credits | 80 credits |
| Month | none | 300 credits |

Also: at most 5 requests per minute, one answer in flight at a time, and a
monthly spend cap of 700,000 micro-USD. Session titles do not count as
requests. A refused request says which window it hit and when that window
resets. A chat answer runs at most 5 model steps, and a Studio document at most 8.
The last step runs without tools, so every answer ends with text. A message is at
most 4,000
characters. The `@` menu runs at most 60 searches a minute per student, and
the server refuses the rest with a short wait message.

Materi PDFs are read only up to 25 MB, 200 pages, and 60,000 characters, and a
read that takes longer than 20 seconds reports the lesson as not available.
A Materi is offered in the menu only when it has text the reader can use.

## Tools and data boundary

The model reads through seven read-only tools. Each one checks the student's
own data and the release and visibility rules before it returns anything.

| Tool | Returns |
| --- | --- |
| `get_learning_overview` | The student's learning overview |
| `list_kuis_attempts`, `get_kuis_attempt_review` | Released Kuis attempts and a review of one |
| `list_tryout_results`, `get_tryout_result_review` | Released Tryout results and a review of one |
| `search_materi`, `read_materi` | Published Materi the student can see |

What is stored:

- Conversations and messages: `vera_conversations`, `vera_messages`.
- Studio documents: `vera_studio_documents`, with their markdown, sources, and
  input.
- Usage: `vera_usage_events`, with counts, tokens, credits, and costs. It holds
  no message text.

A saved answer or document keeps only the links a tool returned. Any other
link keeps its text and loses its target. A run that was cut off or failed
after writing some text is saved as an incomplete document, marked "Belum
selesai". A run that wrote no text saves nothing, and its usage is still
settled.

Admins see the cost view at `/admin/ai` and `/admin/ai/usage`: requests,
credits, and USD (with IDR at the configured rate) for the day and the month,
and a per-student table. It shows counts, credits, and costs only, never
message or document text.

## Running the checks

Apply migrations to the local dev database (`127.0.0.1:55432`) and regenerate
the client after schema changes:

```bash
pnpm db:generate
pnpm exec prisma migrate deploy
```

Each suite writes rows, so it refuses to run unless `DATABASE_URL` points at
the local dev database. Run them through the resource guard:

```bash
./_harness/resource-guard.sh run -- rtk pnpm test:vera-authorization
./_harness/resource-guard.sh run -- rtk pnpm test:vera-admin-usage
./_harness/resource-guard.sh run -- rtk pnpm test:vera-chat
./_harness/resource-guard.sh run -- rtk pnpm test:vera-ledger
./_harness/resource-guard.sh run -- rtk pnpm test:vera-mentions
./_harness/resource-guard.sh run -- rtk pnpm test:vera-model
./_harness/resource-guard.sh run -- rtk pnpm test:vera-sessions
./_harness/resource-guard.sh run -- rtk pnpm test:vera-studio
./_harness/resource-guard.sh run -- rtk pnpm test:vera-tools
```

The unit suites never call OpenAI. They use scripted models from the AI SDK's
test helpers. The browser pass is run with ego-browser against a dev server
with the real model. `test:vera-obscura-smoke` is kept in the repository but is
not a required check. It is unverified: its first run failed at login, and the
ego-browser pass replaces it.

## Local development

With `OPENAI_API_KEY` set, `pnpm dev` sends real requests to OpenAI and they
are billed. Set `VERA_MOCK_MODEL=1` instead to work offline. The stand-in
answers with fixed sample text and a fixed title, so it checks streaming,
credits, and saving, but not answer quality.
