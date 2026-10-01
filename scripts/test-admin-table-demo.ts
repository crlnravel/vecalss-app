import assert from "node:assert/strict";
import { queryTransactions, ROW_HEIGHT, transactions, transactionsCsv, virtualWindow } from "../modules/admin/table-demo/transactions";

assert.equal(transactions.length, 10_000);
assert.equal(new Set(transactions.map((row) => row.id)).size, 10_000);
const descending = queryTransactions("", "all", { key: "date", direction: "desc" });
assert.equal(descending[0].customer, "Sana Qureshi");
const match = queryTransactions(" SANA.QUReSHI ", "Refunded", { key: "amount", direction: "asc" });
assert.ok(match.length > 0);
assert.ok(match.every((row) => row.customer === "Sana Qureshi" && row.status === "Refunded"));
assert.ok(match.every((row, i) => !i || row.amount >= match[i - 1].amount));
assert.deepEqual(queryTransactions("does-not-exist", "all", { key: "date", direction: "desc" }), []);
assert.ok(queryTransactions("6685", "all", { key: "date", direction: "desc" }).some((row) => row.id === transactions[0].id));
for (const count of [0, 1, 25, 50, 10_000]) {
  for (const scrollTop of [0, 500, 1000, Math.max(0, count * ROW_HEIGHT - 560)]) {
    const { start, end, before, after } = virtualWindow(count, scrollTop);
    assert.ok(start >= 0 && start <= end && end <= count);
    assert.ok(end - start <= 21, "DOM row count stays bounded");
    assert.equal(before + (end - start) * ROW_HEIGHT + after, count * ROW_HEIGHT);
  }
}
const csv = transactionsCsv([{ ...transactions[0], customer: 'Mock, "Customer"' }]);
assert.ok(csv.includes('"Mock, ""Customer"""'));
assert.ok(csv.includes('"1805.97"'));
assert.equal(csv.split("\r\n").length, 2);
console.log("Admin table demo: filtering, sorting, CSV quoting, and virtualization passed.");
