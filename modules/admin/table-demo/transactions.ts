export type Transaction = {
  id: string;
  charge: string;
  customer: string;
  email: string;
  avatar: number;
  amount: number;
  status: "Settled" | "Pending" | "Refunded";
  method: "mastercard" | "amex" | "visa";
  card: string;
  channel: "API" | "Web" | "Mobile" | "POS";
  risk: number;
  date: number;
};

const customers = [
  ["Sana Qureshi", "sana.qureshi@outlook.com"],
  ["Omar Haddad", "omar.haddad@outlook.com"],
  ["David Kim", "david.kim@hey.com"],
  ["Sofia Romero", "sofia.romero@gmail.com"],
  ["Mira Stone", "mira.stone@northbeam.co"],
  ["Alex Johnson", "alex.johnson@gmail.com"],
] as const;

const firstRows = [
  [0, 1805.97, "Refunded", "mastercard", "6685", "API", 87],
  [1, 1740.66, "Settled", "mastercard", "5794", "Web", 96],
  [2, 16.04, "Settled", "mastercard", "2845", "API", 64],
  [3, 1368.47, "Settled", "amex", "4792", "API", 26],
  [2, 3652.33, "Settled", "amex", "4535", "API", 51],
  [3, 7.83, "Settled", "amex", "5477", "POS", 4],
  [1, 1345.10, "Pending", "amex", "8407", "API", 37],
  [4, 1168.61, "Refunded", "visa", "1934", "Mobile", 67],
  [5, 159.22, "Pending", "amex", "2985", "Mobile", 95],
  [0, 588.75, "Settled", "visa", "1334", "Mobile", 2],
] satisfies [number, number, Transaction["status"], Transaction["method"], string, Transaction["channel"], number][];

// Fixed seed: refresh and server/client rendering produce the same mock records.
export const transactions: Transaction[] = Array.from({ length: 10_000 }, (_, index) => {
  const initial = firstRows[index];
  const customerIndex = initial?.[0] ?? (index * 7 % customers.length);
  const [customer, email] = customers[customerIndex];
  return {
    id: `TXN-${(1607724 + index).toString(36).toUpperCase().padStart(5, "0")}`,
    charge: `ch_${(1679616 + index * 7919).toString(36).padStart(7, "0")}`,
    customer, email, avatar: customerIndex,
    amount: initial?.[1] ?? ((index * 13117 % 450000) + 100) / 100,
    status: initial?.[2] ?? (["Settled", "Settled", "Settled", "Pending", "Refunded"] as const)[index % 5],
    method: initial?.[3] ?? (["mastercard", "amex", "visa"] as const)[index % 3],
    card: initial?.[4] ?? String(1000 + index * 113 % 9000),
    channel: initial?.[5] ?? (["API", "Web", "Mobile", "POS"] as const)[index % 4],
    risk: initial?.[6] ?? index * 17 % 100,
    date: Date.UTC(2026, 5, 23, 16, 59) - index * 105_000,
  };
});

export type SortKey = Exclude<keyof Transaction, "charge" | "email" | "avatar" | "card">;
export type Sort = { key: SortKey; direction: "asc" | "desc" };

export function queryTransactions(query: string, status: string, sort: Sort): Transaction[] {
  const needle = query.trim().toLowerCase();
  return transactions.filter((row) =>
    (!needle || `${row.id} ${row.charge} ${row.customer} ${row.email} ${row.card}`.toLowerCase().includes(needle)) &&
    (status === "all" || row.status === status),
  ).sort((a, b) => {
    const left = a[sort.key], right = b[sort.key];
    const comparison = typeof left === "number" && typeof right === "number"
      ? left - right : String(left).localeCompare(String(right));
    return (sort.direction === "asc" ? comparison : -comparison) || a.id.localeCompare(b.id);
  });
}

export const ROW_HEIGHT = 51;
export const GRID_HEIGHT = 560;
export const HEADER_HEIGHT = 32;

export function virtualWindow(count: number, scrollTop: number) {
  const start = Math.max(0, Math.min(count, Math.floor(Math.max(0, scrollTop - HEADER_HEIGHT) / ROW_HEIGHT) - 5));
  const end = Math.min(count, start + Math.ceil(GRID_HEIGHT / ROW_HEIGHT) + 10);
  return { start, end, before: start * ROW_HEIGHT, after: (count - end) * ROW_HEIGHT };
}

export function transactionsCsv(rows: readonly Transaction[]) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  return [
    ["Transaction", "Customer", "Email", "Amount", "Status", "Method", "Card", "Channel", "Risk", "Date"],
    ...rows.map((row) => [row.id, row.customer, row.email, row.amount.toFixed(2), row.status, row.method, row.card, row.channel, row.risk, new Date(row.date).toISOString()]),
  ].map((row) => row.map(escape).join(",")).join("\r\n");
}
