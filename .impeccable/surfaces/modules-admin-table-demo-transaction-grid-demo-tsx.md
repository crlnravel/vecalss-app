---
version: 1
slug: "modules-admin-table-demo-transaction-grid-demo-tsx"
primary_target: "modules/admin/table-demo/transaction-grid-demo.tsx"
related_targets: ["modules/admin/table-demo/transaction-grid-demo.module.css", "app/admin/table-demo/page.tsx"]
---

## Direction contract

MODE: Operate. Help an admin scan a dense transaction grid through familiar table controls and faithful ReUI reference styling.

REFERENCE: The user-requested one-to-one direction from [ReUI's virtualization preview](https://reui.io/preview/base/data-grid-virtualization-1), using its light treatment. This visual exception belongs only to `/admin/table-demo`.

OWN-WORLD: Inside the Vecalss Admin shell, the grid is a contained monochrome ReUI surface. Use Inter at 14px, 14px surface corners, two-line transaction, customer, and date cells, and keep overflow inside the virtual grid. The table header is 32px high with a 31px sorting target; use 44px targets for coarse pointers. Desktop toolbar controls are 36px high.

COPY: Keep reference grid labels in English for fidelity. Keep the page title, navigation label, and mock-data notice in Indonesian.

BOUNDARY: The surrounding Admin shell keeps Vecalss styling; this route-specific reference treatment does not change shared design tokens or `DESIGN.md`.
