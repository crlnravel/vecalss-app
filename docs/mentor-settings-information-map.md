# Pengaturan Kapten: feature and information map

**Snapshot:** 2026-10-01. This describes the redesigned `/mentor/settings` page. Kapten is the product persona; `/mentor` routes and tutor authentication names are internal terminology.

## Purpose and scope

Kapten can edit their profile name and inspect account information. The page borrows the profile summary, slim left navigation, stacked panels, and divided label/value rows from [ReUI solution-users-2](https://reui.io/preview/base/solution-users-2), using Vecalss components and design tokens.

The login email is account information. It is not editable here because it is the credential used by the authentication service. Subject and content-language preferences are omitted because they have no runtime consumers; saving them previously changed no teaching workflow.

## Information architecture

| Area | Information | Behavior |
| --- | --- | --- |
| Profile summary | Saved name, initials, email, Kapten role | Uses saved account data; typing does not change the summary until save succeeds. |
| Local navigation | Profil, Informasi akun | Scrolls to the corresponding section without leaving the page or discarding edits. |
| Profil | Nama profil | Required, editable, trimmed by the server, maximum 160 characters. |
| Profil | Email login | Selectable text with an explanation of its login purpose and current editing boundary. |
| Informasi akun | Peran akun | Kapten, the role associated with this workspace. |
| Informasi akun | ID akun | Selectable account identifier with a copy control and manual-copy recovery if clipboard access fails. |
| Profile footer | Status, Batal, Simpan perubahan | Persistent dirty/saving/saved/error feedback and real save/cancel actions. |

There is no settings search and no disabled account-ID input. The local navigation becomes a horizontal pair on compact screens; rows stack their labels above values and controls.

Each section has one outer border, with horizontal separators between its header, rows, and actions. Row labels share one typography style. Section subtitles and redundant field explanations are omitted; only the email editing limitation and account-ID guidance remain as smaller supporting text beside their values.

## User interactions and states

- Editing the name marks the draft dirty and displays **Ada perubahan yang belum disimpan**.
- **Batal** restores the last saved name without sending a request.
- **Simpan perubahan** submits only the name. During saving, the field and actions are disabled, the form is busy, and the footer says **Menyimpan perubahan…**.
- Successful save replaces the draft and saved snapshot with the returned database values. The profile summary and account menu show the saved name immediately. The footer retains **Perubahan tersimpan** and announces it once.
- A server validation/save failure leaves the draft available. Name validation is associated with the field and exposes its invalid state; a persistence failure appears in the footer for retry.
- Required/max-length browser validation complements server validation. Whitespace-only names are rejected by the server after trimming.
- Dirty forms retain browser-unload protection and the mentor shell's in-app/history navigation guard, with **Tetap di sini** and **Buang perubahan** choices.
- Section navigation only scrolls within the page; it does not invoke the leave guard.
- Copy success uses the shared toast. Failure explains how to select and copy the visible ID manually.

## Behavioral impact

| Value/action | What visibly changes elsewhere? |
| --- | --- |
| Saved profile name | Updates `User.fullName`; the current account menu updates immediately, and subsequent server-loaded account views read the saved name. |
| Login email | No edit is available. Existing email continues to identify the account during sign-in. |
| Account role and ID | Display only; neither identity nor role assignments can be changed by this action. |
| Copy ID | Places the identifier on the clipboard for support/reporting. |
| Removed subject/language preferences | No behavior is lost elsewhere: no runtime consumer was identified. Reintroduce only with a defined, tested teaching effect. |

## Persistence and technical implementation

`getKaptenSettings` and `saveKaptenSettingsAction` both derive identity from `requireTutorSession`. Reads select `User.id`, `User.fullName`, and `User.email`. Save accepts a profile name, validates it, and performs one atomic `User` update scoped to the authenticated user. The database return value is authoritative; `/mentor/settings` is revalidated.

The mutation writes **only `fullName`**. Caller-supplied email, role, account ID, or teaching preference values are not used. The UI has no email-edit affordance, and the backend cannot change it through this action.

The route no longer reads or writes `SystemConfig` entries named `kapten.settings.<userId>`. Existing entries are inert; this redesign does not require a migration or introduce a preferences table. If teaching preferences return, define their actual consumers and a typed persistence model together. The former JSON model/fallback rules are historical implementation details rather than current behavior.

## Boundaries and known gaps

- Verified email changes, password changes, avatar uploads, sessions, notifications, and account deletion are separate capabilities and are not represented by decorative controls here.
- Account creation metadata and save timestamps are not displayed because they are unnecessary to this focused form.
- Repository-wide verification has unrelated lint/type failures outside settings. See the redesign artifact for task-specific verification evidence and limitations.

## Source files

- [Protected route](../app/mentor/settings/page.tsx)
- [Settings page and interaction state](../modules/mentor/KaptenSettingsPageModule.tsx)
- [Server read/save boundary](../modules/mentor/settings-actions.ts)
- [Settings data contract](../modules/mentor/settings-types.ts)
- [Shared workspace shell and leave guard](../modules/mentor/components/mentor-workspace-shell.tsx)
- [Authentication email lookup](../lib/auth/service.ts)
- [Storage models](../prisma/schema.prisma)
