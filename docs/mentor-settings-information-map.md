# Pengaturan Kapten: feature and information map

**Snapshot:** 2026-10-01. This describes the redesigned `/mentor/settings` page. Kapten is the product persona; `/mentor` routes and tutor authentication names are internal terminology.

## Purpose and scope

Kapten can edit their profile name, inspect account information, and choose the teaching subject used as the initial quiz-table filter. The page borrows the profile summary, slim left navigation, and divided label/value rows from [ReUI solution-users-2](https://reui.io/preview/base/solution-users-2), using Vecalss components and design tokens.

The login email is account information. It is not editable here because it is the credential used by the authentication service. The teaching subject now affects the quiz table; content language remains omitted because it has no runtime consumer.

## Information architecture

| Area | Information | Behavior |
| --- | --- | --- |
| Profile summary | Saved name, initials, email, Kapten role | Uses saved account data; typing does not change the summary until save succeeds. |
| Menu navigation | Profil, Subjek | Shows one settings menu at a time; retains both drafts. |
| Profil | Nama profil | Required, editable, trimmed by the server, maximum 160 characters. |
| Profil | Email login | Selectable text with an explanation of its login purpose and current editing boundary. |
| Informasi akun | Peran akun | Kapten, the role associated with this workspace. |
| Informasi akun | ID akun | Selectable account identifier with a copy control and manual-copy recovery if clipboard access fails. |
| Subjek | Subjek yang diajar | One optional dropdown; saved selection becomes the default quiz-table subject filter. |
| Menu footer | Status, Batal, Simpan perubahan | Persistent dirty/saving/saved feedback; save/cancel affects only the visible menu. |

There is no settings search and no disabled account-ID input. **Profil** and **Subjek** switch the visible settings menu, rather than scrolling to sections. Informasi akun is contained in Profil. The menu navigation becomes a horizontal pair on compact screens; rows stack their labels above values and controls. Subjek contains one dropdown, including **Tidak ditentukan** to clear the default.

Each section has one outer border, with horizontal separators between its header, rows, and actions. Row labels share one typography style. Section subtitles and redundant field explanations are omitted; only the email editing limitation and account-ID guidance remain as smaller supporting text beside their values.

The subject dropdown includes one short explanation of its actual quiz-filter behavior. Drafts and feedback are separate for each menu. Switching menus retains drafts; saving/canceling affects only the visible menu. The leave guard considers unsaved changes in both menus.

## User interactions and states

- Editing either field marks that menu dirty and displays **Ada perubahan yang belum disimpan**.
- **Batal** restores the visible menu's last saved value without sending a request.
- **Simpan perubahan** submits only the visible menu's value. During saving, controls and menu buttons are disabled, the form is busy, and the footer says **Menyimpan perubahan…**.
- Successful save replaces that menu's draft and the saved snapshot with returned database values. The profile summary and account menu show the saved name immediately. The footer retains neutral **Perubahan tersimpan**; Sonner announces success once.
- A server validation/save failure leaves the draft available. Validation is associated with the relevant field and exposes its invalid state; a persistence failure uses the shared error toast.
- Required/max-length browser validation complements server validation. Whitespace-only names are rejected by the server after trimming.
- Dirty forms retain browser-unload protection and the mentor shell's in-app/history navigation guard, with **Tetap di sini** and **Buang perubahan** choices.
- Menu switching shows the selected form without invoking the leave guard. If the other menu remains dirty, the footer names it.
- Copy success uses the shared toast. Failure explains how to select and copy the visible ID manually.

## Behavioral impact

| Value/action | What visibly changes elsewhere? |
| --- | --- |
| Saved profile name | Updates `User.fullName`; the current account menu updates immediately, and subsequent server-loaded account views read the saved name. |
| Login email | No edit is available. Existing email continues to identify the account during sign-in. |
| Account role and ID | Display only; neither identity nor role assignments can be changed by this action. |
| Copy ID | Places the identifier on the clipboard for support/reporting. |
| Teaching subject | Supplies the initial subject filter at `/mentor/quiz` when the URL has no explicit subject. Manual subject/all-subject overrides win and survive table navigation. |
| Cleared teaching subject | Restores the unfiltered quiz-table default. |
| Removed language preference | No behavior is lost elsewhere: no runtime consumer was identified. |

## Persistence and technical implementation

`getKaptenSettings` and `saveKaptenSettingsAction` both derive identity from `requireTutorSession`. Reads select `User.id`, `User.fullName`, and `User.email`. Save accepts a profile name, validates it, and performs one atomic `User` update scoped to the authenticated user. The database return value is authoritative; `/mentor/settings` is revalidated.

The profile mutation writes **only `fullName`**. Caller-supplied email, role, account ID, or teaching preference values are not used. The UI has no email-edit affordance, and the backend cannot change it through this action.

`saveKaptenSubjectAction` separately authenticates the Kapten, validates an available subject or null, and updates only `TutorProfile.teachingSubjectCode`. This nullable typed field references `Subtest.code`; deleting a subject clears the reference. Reads ignore inactive subjects. The subject action revalidates settings and the quiz route. Migration `20261001070000_tutor_teaching_subject` introduces the field and index.

The route does not read or write `SystemConfig` entries named `kapten.settings.<userId>`. Existing entries are inert; the former JSON model/fallback rules are historical implementation details. No saved selection means all subjects, rather than an invented default of PU.

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
