# Student self-registration (MS-21)

How students create their own PTN Pro account, what keeps it from being abused,
and what the owner still has to supply before it opens. Design decisions are on
the MS-21 ticket; this note says how the code behaves.

## The flow

1. `/daftar`: name, email, password, the age box ("Saya berusia 18 tahun ke atas, atau sudah mendapat izin orang tua/wali") and a Turnstile check.
2. The server answers `/daftar/periksa-email` the same way for a new address, an address that already has an account, a blocked identifier and a pending signup. Only the email differs: a verification link, or "Kamu sudah punya akun PTN Pro".
3. `/daftar/verifikasi/<link>` shows a button. Opening the link only reads; the button POSTs and verifies.
4. The next step is `/login?notice=email-verified`. A buyer who came from checkout signs in and lands on the checkout; a referral code alone lands on `/pricing?ref=...`.

Sign-in refuses an unverified account (only after the password matched) and offers a new link. No session can be created for an unverified account: `createSession`, `switchSessionToUser` and the sign-in insert all check it.

## The switch

`REGISTRATION_OPEN` is off unless `1`, `true`, `on` or `yes`. Even then `getRegistrationStatus()` (`lib/registration/switch.ts`) keeps signup closed unless all hold:

| Needed | Setting |
| --- | --- |
| Paywall on | `PAID_ACCESS_ENFORCED` |
| Sending domain | `EMAIL_FROM` and `RESEND_API_KEY` |
| Turnstile | `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (only `next dev` falls back to Cloudflare's test keys) |
| Legal pages | privacy policy and terms of service `status: "approved"` in `lib/legal/*`, with no placeholder left in the text |
| Fraud lookups | `FRAUD_LOOKUP_SECRET` (32+ characters) |

While closed, `/daftar` shows a notice, the form action writes nothing, and the login page keeps linking to `REGISTRATION_FORM_URL`.

**Local exception.** On a developer's own machine only (the same gate as the local payment stand-in: `PAYMENT_STAND_IN_LOCAL=1`, not production, loopback database and `APP_BASE_URL`, no hosting-platform variable), draft legal pages and a missing email sender do not close signup. Everything else still applies.

## Controls

- **Turnstile**: script from Cloudflare (CSP allows `https://challenges.cloudflare.com` in `script-src` and `frame-src`), token checked against `siteverify` (`lib/registration/turnstile.ts`). Explicit rendering, because the implicit scan only runs when the script first loads.
- **Limits** (Postgres, `registration_attempts`, removed after 90 days with the other security logs): 20 signups per address per hour, 3 signups per email per hour, 3 resends per email per hour (20 per address). Every attempt counts alike, so a refusal says nothing about accounts.
- **Fraud blocks**: email, device and address blocks are checked at signup and resend; a hit gives the same neutral answer and opens an MS-07 `blocked_attempt` case about the block (ids and types only), deduped while open.
- **Links**: random, only the hash stored, one use, 24 hours, ended by a newer link.
- **Password**: the same rule as everywhere (`hashPassword`), read exactly as typed.
- **Consent**: the version of each legal page, the age box, the time of the tick and the address are held on the link and become an append-only `registration_consents` row when the email is verified. The table is in the MS-10 registry (`evidence_tables`): insert only.
- **Cleanup**: the daily job deletes self-registered accounts that stay unverified 7 days after their newest link (`lib/registration/cleanup.ts`). An account with anything unexpected attached is not forced out; it is counted, and the owner is emailed (`registration_cleanup`).
- **Risk tier**: a new account is "new/unverified" under MS-06.

## Owner inputs still missing

All live in `lib/legal/owner-inputs.ts` as bracketed placeholders and show on the draft pages: legal entity name and address, privacy and support email, support WhatsApp, response time, dispute city, Vera chat retention, consent record retention, Redis provider and regions, the analytics note, and the effective date. A legal version marked `approved` that still contains one fails `pnpm test:legal-documents`. Retention numbers on the privacy page: payment and order records 10 years, buyer IP and device evidence 12 months, fraud review records 2 years after the case closes, unfinished checkout intents 30 days, app logs 30 days, unverified signups 7 days, security logs 90 days.

To approve a page: fill the placeholders, set `status: "approved"` on the new version, and bump `version` if anyone has agreed to the old text.

## Trying it locally

1. In the worktree's `.env.local` set `REGISTRATION_OPEN=1`, `PAID_ACCESS_ENFORCED=1`, `PAYMENT_STAND_IN_LOCAL=1`, `TURNSTILE_SITE_KEY=1x00000000000000000000AA`, `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` and a `FRAUD_LOOKUP_SECRET` of 32+ characters, with `APP_BASE_URL` on a loopback port.
2. Start the app on a free port, for example `next dev -p 5033` with `APP_BASE_URL=http://localhost:5033`.
3. Open `/daftar`. Cloudflare's test widget passes by itself. Fill the form and tick the box.
4. `/daftar/periksa-email` shows the verification link on screen (outside production only). To also send mail, set `RESEND_API_KEY`, `EMAIL_FROM="PTN Pro <onboarding@resend.dev>"` and `EMAIL_DEV_REDIRECT=delivered@resend.dev`.
5. Open the link, press "Verifikasi email", then sign in.

The test secret `2x0000000000000000000000000000000AA` makes every check fail, for the error path.
