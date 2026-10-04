import assert from "node:assert/strict";
import { buildQuestionBankHref, canonicalQueryEquals, parseQuestionBankQuery } from "@/lib/navigation/canonical-context";

for (const purpose of ["quiz", "tryout"] as const) {
  assert.equal(parseQuestionBankQuery({ purpose }).pageSize, 6);
  for (const size of [6, 10, 20, 50]) {
    const parsed = parseQuestionBankQuery({ purpose, pageSize: String(size), page: "2", folder: "unfiled", subtest: ["PU", "PK"], status: "published", q: "aljabar" });
    assert.equal(parsed.issues.length, 0);
    const href = buildQuestionBankHref(parsed);
    const roundTrip = parseQuestionBankQuery(new URLSearchParams(href.split("?")[1]));
    assert.equal(roundTrip.pageSize, size);
    assert.equal(roundTrip.page, 2);
    assert.equal(roundTrip.purpose, purpose);
    assert.equal(roundTrip.folder, "unfiled");
    assert.deepEqual(roundTrip.subtest, ["PU", "PK"]);
    assert.equal(roundTrip.status, "published");
    assert.equal(roundTrip.q, "aljabar");
    assert.ok(canonicalQueryEquals(new URLSearchParams(href.split("?")[1]), buildQuestionBankHref(roundTrip)));
  }
  for (const value of ["", "0", "-1", "99999", "NaN", "6.0", "06"]) {
    assert.ok(parseQuestionBankQuery({ purpose, pageSize: value }).issues.some((issue) => issue.field === "pageSize"));
  }
  assert.ok(parseQuestionBankQuery({ purpose, pageSize: ["6", "10"] }).issues.some((issue) => issue.field === "pageSize"));
}
console.log("Both Bank Soal purposes preserve bounded server pagination and query context.");
