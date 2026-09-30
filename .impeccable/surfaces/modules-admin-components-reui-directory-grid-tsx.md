---
version: 1
slug: "modules-admin-components-reui-directory-grid-tsx"
primary_target: "modules/admin/components/reui-directory-grid.tsx"
related_targets: ["modules/admin/components/reui-directory-grid.module.css","modules/admin/EnrollmentPageModule.tsx","modules/admin/KaptenPageModule.tsx","modules/admin/AffiliatorPageModule.tsx"]
---

## Direction contract

MODE: Operate. Admin scans and manages student, Kapten, and affiliator accounts.

REFERENCE: Exact table visual language from the deployed https://reui.io/preview/base/data-grid-base-6 Members preview. Keep the ReUI structure within the existing light Admin portal. Per the user’s follow-up, apply Sea-Glass Wash background, Soft Border, 20px outer corners, and padding (24px desktop, 16px mobile), with Voyage Ink/Muted Ink text and Voyage Deep primary actions.

BOUNDARY: User explicitly requested independent table markup and styling rather than existing Vecalss table components. Use Inter at 14px, 32px header rows, 53px body rows, 32px avatars with initials when images are absent, name plus email prefix, understated dividers, hover-revealed existing actions, flat toolbar/footer, and inline status dots. Existing dialog/sheet forms and data contracts remain.

COPY: Keep the app's Indonesian directory names, account statuses, and meaningful actions. Use real directory fields; never invent demo billing or authentication claims.

VERIFICATION: Desktop and 390px mobile renderings, scoped overflow, sorting/search/status/date filters, pagination, previews, and import/add triggers. Preserve server filtering for student/Kapten. Affiliator filtering runs over its existing loaded records.
