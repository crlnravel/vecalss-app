import assert from "node:assert/strict";
import fs from "node:fs";

const catalogue = fs.readFileSync("modules/mentor/KaptenQuestionBankCataloguePageModules.tsx", "utf8");
const dataTable = fs.readFileSync("components/ui/data-table.tsx", "utf8");
const table = fs.readFileSync("components/ui/table.tsx", "utf8");
const contextMenu = fs.readFileSync("components/ui/context-menu.tsx", "utf8");

assert.match(catalogue, /id: "subject"[\s\S]*label: "Subject"/u, "the catalogue must expose Subject as its own column");
assert.match(catalogue, /id: "materi"[\s\S]*label: "Materi"/u, "the catalogue must expose Materi as its own column");
assert.doesNotMatch(catalogue, /id: "category"[\s\S]*label: "Kategori"/u, "the catalogue must not expose Kategori in the visible catalogue");
assert.doesNotMatch(catalogue, /id: "coverage"/u, "the catalogue must not merge Subject and Materi into coverage");
assert.match(
  catalogue,
  /<p className="block truncate text-xs text-secondary-500">\s*\{row\.bank\.questionCount\}\s+soal\s*<\/p>/u,
  "bank rows must show only their question count in the secondary line",
);
assert.doesNotMatch(catalogue, /row\.bank\.questionCount\} soal\{row\.bank\.folderPath/u, "bank rows must not expose their folder path");
assert.match(catalogue, /showColumnVisibility=\{false\}/u, "Bank Soal must hide the column-visibility widget");
assert.doesNotMatch(catalogue, /label: "Aksi"/u, "the catalogue must not render an Aksi column");
assert.match(catalogue, /ContextMenuContent[\s\S]*Edit bank soal/u, "bank actions must remain available in the row context menu");
assert.match(catalogue, /ContextMenuContent[\s\S]*Ubah nama/u, "folder actions must remain available in the row context menu");
assert.match(catalogue, /rowContextMenu=\{catalogueRowContextMenu\}/u, "the catalogue must attach actions to each row context menu");
assert.match(catalogue, /const openCatalogueRow = \(row: QuestionBankCatalogueRow\)[\s\S]*?router\.push\(row\.bank\.href\)/u, "catalogue rows must navigate to their folder or bank destination");
assert.match(catalogue, /onRowClick=\{openCatalogueRow\}/u, "the catalogue must make the full row navigable");
assert.match(catalogue, /id: "materi"[\s\S]*?width: 30/u, "Materi should receive the larger table share");
assert.match(catalogue, /id: "status"[\s\S]*?width: 10/u, "Status should receive the smaller table share");
assert.match(catalogue, /tableClassName="min-w-0"/u, "the catalogue table should stay within its fluid container");
assert.match(catalogue, /cellClassName: "max-lg:hidden"/u, "secondary columns should collapse before they force narrow-screen overflow");
assert.match(dataTable, /rowContextMenu\?: \(row: T\) => ReactNode/u, "DataTable must support row context menu content");
assert.match(dataTable, /onRowClick\?: \(row: T\) => void/u, "DataTable must support full-row navigation");
assert.match(dataTable, /<ContextMenuTrigger render=\{tableRow\}/u, "DataTable must render the context trigger on the semantic table row");
assert.match(table, /forwardRef<HTMLTableRowElement/u, "table rows must forward refs for context-menu positioning and focus");
assert.match(contextMenu, /ContextMenuPrimitive\.Root/u, "the shared context-menu wrapper must use Base UI context-menu primitives");

console.log("Bank Soal catalogue Subject/Materi and row context-menu contracts passed.");
