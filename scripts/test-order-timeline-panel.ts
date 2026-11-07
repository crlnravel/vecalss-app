import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TimelineEntry } from "../lib/admin/order-timeline";
import { OrderTimelinePanel, PurgedTimelinePanel } from "../modules/admin/fraud/order-timeline-panel";

/**
 * MS-22: the order page's timeline panel. A read-only table with a caption, one
 * line per cell, a badge per line, links only where an entry has one, an empty
 * state, and the purged-order note. Rendered to static markup (no database).
 */

const entry = (patch: Partial<TimelineEntry>): TimelineEntry => ({
  actor: "Sistem",
  at: "2026-11-07T03:00:00.000Z",
  detail: null,
  href: null,
  hrefLabel: null,
  key: "k1",
  source: "audit",
  title: "Pesanan dibuat",
  tone: "neutral",
  ...patch,
});

const html = renderToStaticMarkup(createElement(OrderTimelinePanel, {
  entries: [
    entry({ actor: "Pembeli", detail: "Rp49.000 · Dari alamat 203.0.*.*", title: "Pesanan dibuat" }),
    entry({ at: "2026-11-07T03:00:05.000Z", key: "k2", title: "Pembayaran diterima, pesanan lunas", tone: "success" }),
    entry({ at: "2026-11-07T03:00:06.000Z", key: "k3", title: "Kabar ditahan", tone: "danger" }),
    entry({ at: "2026-11-07T03:00:07.000Z", href: "/admin/fraud/abc", hrefLabel: "Buka kasus", key: "k4", source: "fraud", title: "Kasus fraud dibuka", tone: "attention" }),
  ],
}));
assert.match(html, /Riwayat transaksi/u);
assert.match(html, /<caption class="sr-only">Riwayat transaksi pesanan ini<\/caption>/u, "the table has a name for screen readers");
assert.equal((html.match(/<tr[ >]/gu) ?? []).length, 5, "a header row and one row per entry");
assert.match(html, /<time dateTime="2026-11-07T03:00:00.000Z">/u, "times are machine readable");
assert.match(html, /07\.00|10\.00|10:00/u, "times show in Asia/Jakarta (WIB)");
assert.match(html, /href="\/admin\/fraud\/abc"/u, "a related record is linked");
assert.equal((html.match(/<a /gu) ?? []).length, 1, "only the entry that has a link is a link");
assert.match(html, /Berhasil/u);
assert.match(html, /Perlu perhatian/u);
assert.match(html, /Ditinjau/u);
assert.doesNotMatch(html, /<form|<button|<input|<textarea/u, "the timeline cannot change anything");
assert.doesNotMatch(html, /whitespace-normal|<br/u, "no multi-line cells");

const empty = renderToStaticMarkup(createElement(OrderTimelinePanel, { entries: [] }));
assert.match(empty, /Belum ada kejadian tercatat untuk pesanan ini\./u);
assert.match(empty, /colSpan="4"|colspan="4"/u, "the empty row spans the table");

const purged = renderToStaticMarkup(createElement(PurgedTimelinePanel));
assert.match(purged, /Riwayat transaksi tidak tersedia/u);
assert.match(purged, /dihapus sesuai kebijakan retensi/u);
assert.doesNotMatch(purged, /<table/u, "a purged order shows no timeline");

console.log("Order timeline panel checks passed: read-only table with caption, links only where given, empty state, purged note.");
