import assert from "node:assert/strict";
import { parseMentorTryoutContext } from "../lib/navigation/canonical-context";
import { buildTryoutCatalogueHref, buildTryoutWorkspaceHref, readTryoutCatalogueContext, tryoutCatalogueReturnHref, tryoutWorkspaceForQuery, withTryoutCatalogueReturn } from "../lib/navigation/mentor-tryout-continuity";

const catalogue = "/mentor/tryout?q=UTBK+%26+logika&status=draft&page=3";
const query = (href: string) => new URL(href, "http://local").searchParams;
assert.deepEqual(readTryoutCatalogueContext(query(catalogue)), { q: "UTBK & logika", status: "draft", page: 3 });
assert.equal(buildTryoutCatalogueHref(readTryoutCatalogueContext(query(catalogue))), catalogue);
assert.deepEqual(readTryoutCatalogueContext(query("/?status=oops&page=-1")), { q: "", status: "", page: 1 });
assert.equal(buildTryoutCatalogueHref({ q: "", status: "", page: 1 }), "/mentor/tryout");
for (const unsafe of ["https://evil.test/mentor/tryout", "//evil.test/mentor/tryout", "/mentor/tryout/other", "/mentor/tryout/../settings", "javascript:alert(1)"]) {
  assert.equal(tryoutCatalogueReturnHref(unsafe), undefined);
  assert.equal(withTryoutCatalogueReturn("/mentor/tryout/exam", unsafe), "/mentor/tryout/exam");
}
let href = withTryoutCatalogueReturn("/mentor/tryout/exam?parent=parent", catalogue);
for (const tab of ["operations", "participants", "settings", "subtests"] as const) {
  href = buildTryoutWorkspaceHref("exam", tab, query(href));
  assert.equal(tryoutWorkspaceForQuery(query(href)), tab, "Reload/direct entry selects the addressed workspace");
  const parsed = parseMentorTryoutContext(query(href));
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.returnTo, catalogue);
  assert.equal(parsed.parent, "parent");
}
const operations = `/mentor/tryout/exam?workspace=operations&delivery=policy&session=session&resultQ=Alya&resultStatus=submitted&returnTo=${encodeURIComponent(catalogue)}`;
const results = buildTryoutWorkspaceHref("exam", "participants", query(operations));
assert.equal(query(results).get("delivery"), null, "Hasil must not retain an incompatible delivery pane");
assert.equal(query(results).get("resultQ"), "Alya");
assert.equal(query(results).get("resultStatus"), "submitted");
assert.equal(query(results).get("session"), "session");
for (const path of ["/mentor/tryout/exam/soal/PU", "/mentor/tryout/exam/soal/PU/editor", "/mentor/tryout/exam/operations/participants"]) {
  const child = withTryoutCatalogueReturn(path, query(results).get("returnTo"));
  assert.equal(tryoutCatalogueReturnHref(query(child).get("returnTo")), catalogue);
}
console.log("PASS Tryout workspace/catalogue URL round trips, nested return context, independent result filters, unsafe return rejection");
