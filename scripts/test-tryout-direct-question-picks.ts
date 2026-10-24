import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { questionAnswerModeLabel } from "../modules/mentor/question-answer-mode-label";

const [builder, questionManager, repository, sourceRepository, createRoute, editRoute, catalogue] = await Promise.all([
  readFile(new URL("../modules/mentor/KaptenTryoutBuilderPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/components/tryout-section-question-manager.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/question-bank/repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/tryout/create/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/tryout/[tryoutId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutCataloguePageModule.tsx", import.meta.url), "utf8"),
]);
const assessmentRelease = await readFile(new URL("../lib/tryout/assessment-release.ts", import.meta.url), "utf8");
const questionEditorRoute = await readFile(new URL("../app/mentor/tryout/[tryoutId]/soal/[subtest]/editor/page.tsx", import.meta.url), "utf8");
const pickerLayout = await readFile(new URL("../modules/mentor/components/question-bank-picker-layout.tsx", import.meta.url), "utf8");
const kuisPicker = await readFile(new URL("../modules/mentor/components/question-bank-picker.tsx", import.meta.url), "utf8");

assert.match(questionManager, /Pilih Bank Soal/u, "Tryout Questions must expose direct selection");
assert.doesNotMatch(builder, /Set Ready|Pool Soal|Blueprint|CAT Pool/u, "Tryout Questions must expose only direct selection");
assert.doesNotMatch(builder, /Behavior &amp; rules|question-selection-mode|DropdownMenuRadioGroup|<Switch/u, "authoring must not expose CAT or source-mode controls");
assert.match(questionManager, /<Checkbox/u, "direct selection must use a checklist");
assert.equal(questionAnswerModeLabel("single_choice"), "Pilihan ganda");
assert.equal(questionAnswerModeLabel("multiple_choice"), "Pilihan ganda kompleks");
assert.equal(questionAnswerModeLabel(undefined), "Pilihan ganda", "questions without a stored mode keep the single-answer default");
assert.match(builder, /questionTypeLabel = questionAnswerModeLabel\(question\.questionType\)/u, "saved direct questions must use the shared answer-mode label");
assert.match(questionManager, /value=\{question\.questionType\}[\s\S]*?Pilihan ganda/u, "question editor controls must retain answer-mode selection");
assert.match(questionManager, /<QuestionBankPickerRow[\s\S]*?difficulty=\{difficultyLabel\(question\.difficulty\)\}[\s\S]*?subjectCode=\{question\.subjectCode\}/u, "import rows must retain subject and difficulty context");
assert.match(questionManager, /<QuestionBankPickerRow[\s\S]*?answerMode=\{question\.questionType\}[\s\S]*?checkboxId=\{`tryout-source-question-/u, "Tryout import rows must receive each source question's answer mode");
assert.match(pickerLayout, /answerMode\s*\?\s*\([\s\S]*?<Badge size="xs" tone="category">\s*\{questionAnswerModeLabel\(answerMode\)\}/u, "import rows must visibly render the answer mode as a category badge");
assert.doesNotMatch(kuisPicker, /answerMode=\{question\.questionType\}/u, "the shared Kuis import rows must not gain the Tryout-only label");
assert.match(questionManager, /correctChoiceIds/u, "question preview must expose the authored answer key");
assert.match(questionManager, /\$\{selectedCount\} soal dipilih/u, "direct selection must keep the selected count visible");
assert.match(questionManager, /aria-label=\{`Pindah soal \$\{index \+ 1\} ke atas`\}/u, "direct selection must expose keyboard-accessible ordering");
assert.match(questionManager, /aria-label=\{`Pindah soal \$\{index \+ 1\} ke bawah`\}/u, "direct selection must support keyboard-accessible downward movement");
assert.match(questionManager, /questionIds:\s*Array\.from\(selectedRevisions\.keys\(\)\)/u, "checking a source question must add or remove it from the selected request");
assert.match(sourceRepository, /questionType: input\.questionType \?\? QuestionType\.single_choice/u, "new Bank Soal questions must continue to default to single-answer mode");
assert.match(builder, /shuffleItems: true/u, "new and saved sections must randomize question order");
assert.match(builder, /listQuestionBankSourcePageAction/u, "direct selection must browse source Banks through the server action");
assert.match(builder, /listQuestionBankSourceQuestionsAction/u, "direct selection must load Ready questions through the server action");
assert.match(builder, /directQuestions/u, "the draft must carry direct question selections");
assert.match(builder, /subjectCoverage: \[activeSection\.subtest\]/u, "source Banks must be filtered by the active Section subject");
assert.match(builder, /subjectCode: activeSection\.subtest/u, "source questions must be filtered by the active Section subject");
assert.match(builder, /const updateDraft = \(change: \(current: TryoutDraft\) => TryoutDraft\) => \{[\s\S]*latestDraftRef\.current = nextDraft[\s\S]*dispatch\(\{ draft: nextDraft, type: "setDraft" \}\)/u, "draft edits must synchronously advance the snapshot used by save");
assert.match(builder, /const draftToSave = latestDraftRef\.current;/u, "save must read the latest synchronous draft snapshot");
assert.doesNotMatch(builder, /useEffect\(\(\) => \{\s*latestDraftRef\.current = draft/u, "save snapshots must not depend on a lagging draft effect");
assert.match(builder, /const appendImportedQuestions = \(/u, "the builder must import selected questions into the draft");
assert.match(builder, /directQuestions:/u, "the builder must keep imported questions in the draft");
assert.match(builder, /\.\.\.snapshots,/u, "imported questions must append to the latest subtest draft");

assert.match(repository, /type DirectSourceQuestionInput/u, "the save boundary must define direct question inputs");
assert.match(repository, /type DirectSourceQuestionInput = \{ sourceContentDigest: string; sourceQuestionId: string; sourceQuestionRevisionId: string \}/u, "direct selections must carry required source identity");
assert.match(repository, /async function readAndValidateDirectSources/u, "direct source IDs must be re-read on the server");
assert.match(repository, /!selection\.sourceQuestionRevisionId[\s\S]*?selection\.sourceQuestionRevisionId !== revision\.id/u, "missing or stale direct revisions must be rejected");
assert.match(repository, /!selection\.sourceContentDigest[\s\S]*?selection\.sourceContentDigest !== revision\.contentDigest/u, "missing or stale direct content digests must be rejected");
assert.match(repository, /FOR SHARE OF q, b/u, "direct source reads must share-lock Question and Bank rows");
assert.match(repository, /packageCode: "direct"/u, "direct snapshots must not require a saved package");
assert.match(repository, /questionCount: prepared\.snapshots\.length/u, "persisted question snapshots must determine the Section question count");
assert.match(repository, /if \(legacySection\.packageVersionId\) throw new TryoutValidationError\("Paket Soal ini sudah diarsipkan/u, "legacy package bindings must be rejected at the save boundary");
assert.doesNotMatch(repository, /sectionInput\.packageVersionId/u, "Tryout authoring must not resolve package versions");
assert.match(assessmentRelease, /if \(section\.packageVersionId\)\s*\{[\s\S]*?section\.packageVersion\?\.status/u, "release eligibility must retain the published package branch for historical releases");
assert.match(assessmentRelease, /item\.packageVersionId !== null[\s\S]*?item\.sourceRevisionProvenance === QuestionRevisionProvenance\.legacy_unknown/u, "release eligibility must validate direct snapshot provenance");
assert.match(assessmentRelease, /return section\.items\.length === 0 \|\| section\.items\.some/u, "release eligibility must inspect physical direct items");
assert.doesNotMatch(assessmentRelease, /CAT|cat_pool|hasUnsupportedDirectCatItem/u, "release eligibility must remain CBT-only");

assert.doesNotMatch(sourceRepository, /catReady|CANONICAL_2PL_MODEL_VERSION|calibrat/u, "source question DTOs must not expose retired CAT readiness");
assert.match(createRoute, /queryParams\.set\("create", "1"\)/u, "legacy creation must request the catalogue create dialog");
assert.match(editRoute, /getTryoutForEdit/u, "edit route must load the owned Tryout draft");
assert.match(questionEditorRoute, /listQuestionBankSourcePage/u, "dedicated question editor must seed the direct source catalogue");
assert.doesNotMatch(catalogue, /section\.packageVersionId/u, "Tryout catalogue must not expose package readiness");
assert.match(catalogue, /type TryoutItem = \{/u, "Tryout catalogue must use its own display contract");
assert.doesNotMatch(catalogue, /packageVersionId|packageVersion:/u, "catalogue display must not carry package bindings");

console.log("Tryout direct question pick contract passed.");
