"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ImagePlus,
  Plus,
  Save,
  Trash2,
  X,
} from "@/lib/icons";
import { useEffect, useReducer, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionContext } from "@/lib/auth/types";
import type { MediaAssetDto } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import {
  MediaAssetPreview,
  MediaPickerDialog,
} from "@/modules/media/media-library";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  kaptenSubjects,
  type BankQuestion,
  type KaptenQuestionBank,
} from "@/modules/mentor/mock-data";
import {
  saveQuestionBankAction,
  updateQuestionBankLifecycleAction,
} from "@/modules/mentor/question-bank-actions";

const INVENTORY_QUESTIONS_PER_PAGE = 9;

type ConfirmationRequest = {
  confirmLabel: string;
  description: string;
  onConfirm: () => void;
  title: string;
};

type MediaPickerTarget =
  | { kind: "choice"; choiceId: string; label: string }
  | { kind: "explanation"; label: string }
  | { kind: "prompt"; label: string };

type QuestionBankEditorState = {
  activeQuestionId: string | null;
  activeTab: string;
  confirmationRequest: ConfirmationRequest | null;
  inventoryPage: number;
  questionDraft: BankQuestion;
  hasUnsavedChanges: boolean;
  pendingRouteReplacement: string | null;
  mediaPickerTarget: MediaPickerTarget | null;
  lifecycleError: string | null;
  lifecycleStatus: KaptenQuestionBank["status"];
  isSaving: boolean;
  questionEditorTab: string;
  previewChoiceId: string | null;
  hasSubmittedPreview: boolean;
};

type LocalQuestionBankState = {
  description: string;
  questions: BankQuestion[];
  subjectCode: string;
  title: string;
};

type QuestionBankEditorAction = { type: "patch"; patch: Partial<QuestionBankEditorState> };

function questionBankEditorReducer(state: QuestionBankEditorState, action: QuestionBankEditorAction): QuestionBankEditorState {
  return action.type === "patch" ? { ...state, ...action.patch } : state;
}

function QuestionMediaAttachment({
  assetId,
  label,
  onRemove,
  onReplace,
}: {
  assetId: string;
  label: string;
  onRemove: () => void;
  onReplace: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary-100 bg-primary-50/35 p-3">
      <MediaAssetPreview
        alt={label}
        assetId={assetId}
        className="max-h-48 bg-white"
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          onClick={onReplace}
          size="sm"
          type="button"
          variant="brandOutline"
        >
          <ImagePlus data-icon="inline-start" />
          Ganti
        </Button>
        <Button onClick={onRemove} size="sm" type="button" variant="ghost">
          <X data-icon="inline-start" />
          Lepas
        </Button>
      </div>
    </div>
  );
}

const emptyQuestion = (bankId: string, subjectCode: string): BankQuestion => ({
  bankId,
  choices: [
    { id: "a", text: "" },
    { id: "b", text: "" },
  ],
  correctChoiceId: "a",
  difficulty: "medium",
  explanation: "",
  id: "",
  prompt: "",
  subjectCode,
  tags: [],
});

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "bank-soal-baru";
}

function isReady(question: BankQuestion) {
  return (
    question.prompt.trim() &&
    question.choices.length >= 2 &&
    question.choices.length <= 5 &&
    question.choices.every((choice) => choice.text.trim()) &&
    question.choices.some((choice) => choice.id === question.correctChoiceId)
  );
}

function toQuestionDraft(question: BankQuestion): BankQuestion {
  return {
    ...question,
    choices: question.choices.map((choice) => ({ ...choice })),
    tags: [],
  };
}

function QuestionBankEditorForm({
  activeQuestionId,
  isQuestionContentLocked,
  onAddChoice,
  onOpenMedia,
  onRemoveChoice,
  onRemoveChoiceMedia,
  onUpdate,
  questionDraft,
}: {
  activeQuestionId: string | null;
  isQuestionContentLocked: boolean;
  onAddChoice: () => void;
  onOpenMedia: (target: MediaPickerTarget) => void;
  onRemoveChoice: (choiceId: string) => void;
  onRemoveChoiceMedia: (choiceId: string) => void;
  onUpdate: (question: BankQuestion) => void;
  questionDraft: BankQuestion;
}) {
  return (
    <div className="grid gap-5 rounded-3xl border border-primary-100 bg-white p-5 shadow-sm md:p-7">
      <Field>
        <div className="flex flex-wrap items-center justify-between gap-2"><FieldLabel htmlFor="question-prompt">Pertanyaan</FieldLabel><Button disabled={!activeQuestionId} onClick={() => onOpenMedia({ kind: "prompt", label: "Gambar pertanyaan" })} size="sm" type="button" variant="ghost"><ImagePlus data-icon="inline-start" />{questionDraft.promptMediaAssetId ? "Ganti gambar" : "Tambah gambar"}</Button></div>
        <FieldTextarea id="question-prompt" onChange={(event) => onUpdate({ ...questionDraft, prompt: event.target.value })} value={questionDraft.prompt} />
        {questionDraft.promptMediaAssetId ? <QuestionMediaAttachment assetId={questionDraft.promptMediaAssetId} label="Gambar pertanyaan" onRemove={() => onUpdate({ ...questionDraft, promptMediaAssetId: undefined })} onReplace={() => onOpenMedia({ kind: "prompt", label: "Gambar pertanyaan" })} /> : null}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        {questionDraft.choices.map((choice, index) => {
          const choiceLabel = String.fromCharCode(65 + index);
          const inputId = `bank-choice-${choice.id}`;
          return <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-primary-100 px-3 py-3" key={choice.id}>
            <div className="flex min-w-0 items-center gap-3">
              <input aria-label={`Jawaban benar opsi ${index + 1}`} checked={choice.id === questionDraft.correctChoiceId} className="size-4 accent-primary-700" name="bank-correct-choice" onChange={() => onUpdate({ ...questionDraft, correctChoiceId: choice.id })} type="radio" />
              <label className="text-xs font-semibold text-primary-800" htmlFor={inputId}>{choiceLabel}</label>
              <input aria-label={`Opsi ${index + 1}`} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-secondary-400" id={inputId} onChange={(event) => onUpdate({ ...questionDraft, choices: questionDraft.choices.map((item) => item.id === choice.id ? { ...item, text: event.target.value } : item) })} placeholder={`Opsi ${choiceLabel}`} value={choice.text} />
              <Button aria-label={`${choice.mediaAssetId ? "Ganti" : "Tambah"} gambar opsi ${choiceLabel}`} disabled={!activeQuestionId} onClick={() => onOpenMedia({ choiceId: choice.id, kind: "choice", label: `Gambar opsi ${choiceLabel}` })} size="icon-sm" type="button" variant="ghost"><ImagePlus /></Button>
              <Button aria-label={`Hapus opsi ${choiceLabel}`} disabled={questionDraft.choices.length <= 2 || isQuestionContentLocked} onClick={() => onRemoveChoice(choice.id)} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button>
            </div>
            {choice.mediaAssetId ? <QuestionMediaAttachment assetId={choice.mediaAssetId} label={`Gambar opsi ${choiceLabel}`} onRemove={() => onRemoveChoiceMedia(choice.id)} onReplace={() => onOpenMedia({ choiceId: choice.id, kind: "choice", label: `Gambar opsi ${choiceLabel}` })} /> : null}
          </div>;
        })}
      </div>
      <div className="flex justify-end"><Button disabled={questionDraft.choices.length >= 5 || isQuestionContentLocked} onClick={onAddChoice} size="sm" type="button" variant="brandOutline"><Plus />Tambah opsi</Button></div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field><FieldLabel htmlFor="question-subtest">Tag subject / Topik</FieldLabel><DropdownMenu><DropdownMenuTrigger disabled={isQuestionContentLocked} render={<Button aria-describedby={isQuestionContentLocked ? "question-subtest-lock" : undefined} className="w-full justify-between" id="question-subtest" type="button" variant="context" />}><span className="truncate">{kaptenSubjects.find((subject) => subject.code === questionDraft.subjectCode)?.name ? `${questionDraft.subjectCode} - ${kaptenSubjects.find((subject) => subject.code === questionDraft.subjectCode)?.name}` : "Pilih subject"}</span><ChevronDown className="size-4 text-secondary-400" /></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-(--anchor-width)"><DropdownMenuLabel>Pilih subject / topik</DropdownMenuLabel><DropdownMenuGroup><DropdownMenuRadioGroup onValueChange={(value) => onUpdate({ ...questionDraft, subjectCode: value })} value={questionDraft.subjectCode}>{kaptenSubjects.map((subject) => <DropdownMenuRadioItem className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900" key={subject.code} value={subject.code}>{subject.code} - {subject.name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>{isQuestionContentLocked ? <p className="text-xs text-secondary-500" id="question-subtest-lock">Subtest dikunci saat Bank diterbitkan. Jadikan draf untuk mengubahnya.</p> : null}</Field>
        <Field><FieldLabel htmlFor="question-difficulty">Tingkat kesulitan</FieldLabel><DropdownMenu><DropdownMenuTrigger disabled={isQuestionContentLocked} render={<Button className="w-full justify-between" id="question-difficulty" type="button" variant="context" />}><span>{questionDraft.difficulty === "easy" ? "Mudah" : questionDraft.difficulty === "hard" ? "Sulit" : "Sedang"}</span><ChevronDown className="text-secondary-400" /></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-(--anchor-width)"><DropdownMenuLabel>Pilih tingkat kesulitan</DropdownMenuLabel><DropdownMenuGroup><DropdownMenuRadioGroup onValueChange={(value) => onUpdate({ ...questionDraft, difficulty: value as BankQuestion["difficulty"] })} value={questionDraft.difficulty}><DropdownMenuRadioItem className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900" value="easy">Mudah</DropdownMenuRadioItem><DropdownMenuRadioItem className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900" value="medium">Sedang</DropdownMenuRadioItem><DropdownMenuRadioItem className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900" value="hard">Sulit</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></Field>
      </div>
      <Field><div className="flex flex-wrap items-center justify-between gap-2"><FieldLabel htmlFor="question-explanation">Penjelasan <span className="font-normal text-secondary-400">(opsional)</span></FieldLabel><Button disabled={!activeQuestionId} onClick={() => onOpenMedia({ kind: "explanation", label: "Gambar penjelasan" })} size="sm" type="button" variant="ghost"><ImagePlus data-icon="inline-start" />{questionDraft.explanationMediaAssetId ? "Ganti gambar" : "Tambah gambar"}</Button></div><FieldTextarea id="question-explanation" onChange={(event) => onUpdate({ ...questionDraft, explanation: event.target.value })} value={questionDraft.explanation} />{questionDraft.explanationMediaAssetId ? <QuestionMediaAttachment assetId={questionDraft.explanationMediaAssetId} label="Gambar penjelasan" onRemove={() => onUpdate({ ...questionDraft, explanationMediaAssetId: undefined })} onReplace={() => onOpenMedia({ kind: "explanation", label: "Gambar penjelasan" })} /> : null}</Field>
    </div>
  );
}

function QuestionBankPreview({ hasSubmittedPreview, onChoiceChange, onSubmit, previewChoiceId, questionDraft }: { hasSubmittedPreview: boolean; onChoiceChange: (choiceId: string) => void; onSubmit: () => void; previewChoiceId: string | null; questionDraft: BankQuestion }) {
  return <section className="rounded-3xl border border-primary-100 bg-white p-5 shadow-sm md:p-7">
    <p className="text-xl leading-8 font-semibold text-secondary-900">{questionDraft.prompt || "Pertanyaan akan tampil di sini."}</p>
    {questionDraft.promptMediaAssetId ? <MediaAssetPreview alt="Gambar pertanyaan" assetId={questionDraft.promptMediaAssetId} className="mt-5" /> : null}
    <RadioGroup className="mt-6" onValueChange={onChoiceChange} value={previewChoiceId ?? undefined}>{questionDraft.choices.map((choice, index) => { const choiceLabel = String.fromCharCode(65 + index); const choiceId = `preview-choice-${questionDraft.id}-${choice.id}`; return <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-primary-100 px-4 py-4 text-sm text-secondary-700 transition-colors hover:border-primary-300 hover:bg-primary-50/60 has-[[data-checked]]:border-primary-300 has-[[data-checked]]:bg-primary-50" htmlFor={choiceId} key={choice.id}><RadioGroupItem id={choiceId} value={choice.id} /><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-800">{choiceLabel}</span><span className="flex min-w-0 flex-1 flex-col gap-3"><span>{choice.text || `Opsi ${choiceLabel}`}</span>{choice.mediaAssetId ? <MediaAssetPreview alt={`Gambar opsi ${choiceLabel}`} assetId={choice.mediaAssetId} className="max-h-44" /> : null}</span></label>; })}</RadioGroup>
    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-primary-100 pt-5"><Button disabled={!previewChoiceId} onClick={onSubmit} type="button" variant="brand">Kirim jawaban</Button>{hasSubmittedPreview ? <p aria-live="polite" className={cn("rounded-2xl px-3 py-2 text-sm font-medium", previewChoiceId === questionDraft.correctChoiceId ? "bg-primary-50 text-primary-800" : "bg-red-50 text-red-800")}>{previewChoiceId === questionDraft.correctChoiceId ? "Jawaban benar." : "Belum tepat. Coba lagi."}</p> : null}</div>
  </section>;
}

function QuestionBankInventory({ activeQuestionId, builderState, inventoryPageCount, onAddQuestion, onNextPage, onOpenQuestion, onPreviousPage, onRemoveQuestion, paginatedQuestions, visibleInventoryPage }: { activeQuestionId: string | null; builderState: { questions: BankQuestion[] }; inventoryPageCount: number; onAddQuestion: () => void; onNextPage: () => void; onOpenQuestion: (question: BankQuestion) => void; onPreviousPage: () => void; onRemoveQuestion: (id: string) => void; paginatedQuestions: BankQuestion[]; visibleInventoryPage: number }) {
  return <aside className="order-1 min-w-0 border-b border-primary-100 pb-5 xl:border-r xl:border-b-0 xl:pr-7 xl:pb-0">
    <div className="flex items-center justify-between gap-4"><h2 className="flex min-h-11 items-center text-2xl font-semibold text-secondary-900">Inventori soal</h2><Button aria-label="Tambah soal" onClick={onAddQuestion} size="icon-sm" type="button" variant="brandOutline"><Plus /></Button></div>
    <ScrollArea className="mt-4 h-56 border-t border-primary-100 xl:mt-5"><div className="grid grid-cols-1 gap-1 pt-3 pr-3 sm:grid-cols-2 lg:grid-cols-3">{paginatedQuestions.length > 0 ? paginatedQuestions.map((question, index) => <div className={cn("flex min-w-0 w-full items-center gap-2 rounded-2xl px-2 py-2 transition-colors", activeQuestionId === question.id ? "bg-primary-50" : "hover:bg-primary-50/60")} key={question.id}><button className="min-w-0 flex-1 text-left" onClick={() => onOpenQuestion(question)} type="button"><span className="flex min-w-0 items-center gap-1 text-sm font-semibold text-secondary-900"><span className="truncate">{String((visibleInventoryPage - 1) * INVENTORY_QUESTIONS_PER_PAGE + index + 1).padStart(2, "0")}. {question.prompt || "Soal tanpa pertanyaan"}</span>{isReady(question) ? <Check aria-label="Siap dipakai Quiz" className="size-4 shrink-0 text-primary-700" /> : null}</span><span className="mt-1 flex flex-wrap items-center gap-2"><Badge size="ui" variant="mint">{question.subjectCode}</Badge>{!isReady(question) ? <span className="text-xs text-secondary-500">Belum lengkap</span> : null}</span></button><Button aria-label={`Hapus soal ${index + 1}`} disabled={builderState.questions.length <= 1} onClick={() => onRemoveQuestion(question.id)} size="icon-sm" title={builderState.questions.length <= 1 ? "Bank Soal minimal memiliki satu soal" : undefined} type="button" variant="ghost"><Trash2 className="size-3.5" /></Button></div>) : <p className="px-2 py-4 text-sm leading-6 text-secondary-500">Belum ada soal. Tambahkan soal pertama dan pilih Subtest-nya.</p>}</div></ScrollArea>
    {builderState.questions.length > 0 ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4"><p className="text-sm text-secondary-500">Halaman {visibleInventoryPage} dari {inventoryPageCount}</p><div className="flex items-center gap-2"><Button aria-label="Halaman sebelumnya" disabled={visibleInventoryPage === 1} onClick={onPreviousPage} size="sm" type="button" variant="brandOutline"><ChevronLeft /> Sebelumnya</Button><Button aria-label="Halaman berikutnya" disabled={visibleInventoryPage === inventoryPageCount} onClick={onNextPage} size="sm" type="button" variant="brandOutline">Berikutnya <ChevronRight /></Button></div></div> : null}
  </aside>;
}

type QuestionBankBuilderFormState = { description: string; questions: BankQuestion[]; subjectCode: string; title: string };
type QuestionBankBuilderViewState = {
  activeQuestionId: string | null;
  activeTab: string;
  confirmationRequest: ConfirmationRequest | null;
  hasSubmittedPreview: boolean;
  hasUnsavedChanges: boolean;
  inventoryPageCount: number;
  isQuestionContentLocked: boolean;
  isSaving: boolean;
  isDraftLifecycle: boolean;
  lifecycleError: string | null;
  mediaPickerTarget: MediaPickerTarget | null;
  paginatedQuestions: BankQuestion[];
  pendingRouteReplacement: string | null;
  previewChoiceId: string | null;
  questionDraft: BankQuestion;
  questionEditorTab: string;
  selectedMediaAssetId: string | undefined;
  visibleInventoryPage: number;
};
type QuestionBankBuilderActions = {
  addChoice: () => void;
  addQuestion: () => void;
  closeConfirmation: () => void;
  confirmPendingAction: () => void;
  onChangeTab: (value: string) => void;
  onChoiceChange: (value: string) => void;
  onCloseMedia: () => void;
  onEditorTabChange: (value: string) => void;
  onNextPage: () => void;
  onOpenMedia: (target: MediaPickerTarget) => void;
  onOpenQuestion: (question: BankQuestion) => void;
  onPreviousPage: () => void;
  onRemoveChoice: (choiceId: string) => void;
  onRemoveChoiceMedia: (choiceId: string) => void;
  onRemoveQuestion: (id: string) => void;
  onSelectMedia: (asset: MediaAssetDto) => void;
  onSubmitPreview: () => void;
  onUpdateDraft: (question: BankQuestion) => void;
  saveDraft: () => void;
  updateMetadata: (field: "title" | "description", value: string) => void;
  updateLifecycle: (operation: "publish" | "unpublish") => void;
};

function QuestionBankBuilderScreen({ actions, builderState, mode, session, state }: { actions: QuestionBankBuilderActions; builderState: QuestionBankBuilderFormState; mode: "create" | "edit"; session: SessionContext; state: QuestionBankBuilderViewState }) {
  const confirmation = state.confirmationRequest;
  return (
    <MentorWorkspaceShell activeLabel="Bank Soal" breadcrumbLabel={mode === "create" ? "Buat Bank Soal" : "Edit Bank Soal"} mainClassName="max-w-[1500px] gap-7" onNavigateAway={() => !state.hasUnsavedChanges} searchPlaceholder="Cari bank soal, topik, atau tingkat kesulitan..." session={session} shouldGuardNavigation={state.hasUnsavedChanges}>
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><Button render={<Link href="/mentor/quiz/question-bank" />} aria-label="Kembali ke bank soal" size="icon-sm" title="Kembali ke bank soal" variant="ghost"><ChevronLeft /></Button><div className="mt-5 flex flex-col gap-x-3 gap-y-2"><h1 className="text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">{mode === "create" ? "Buat Bank Soal" : builderState.title}</h1><span className={cn("inline-flex items-center gap-2 text-sm font-medium", state.hasUnsavedChanges ? "text-[#856300]" : "text-primary-800")}><span aria-hidden="true" className={cn("size-2 rounded-full", state.hasUnsavedChanges ? "bg-[#d29b18]" : "bg-primary-700")} />{state.hasUnsavedChanges ? "Belum disimpan" : "Tersimpan"}</span></div></div>
        <div className="flex flex-wrap gap-2"><Button aria-label="Simpan perubahan" disabled={state.isSaving} onClick={actions.saveDraft} size="icon-sm" title="Simpan perubahan" type="button" variant="brand"><Save /></Button>{state.isDraftLifecycle ? <Button onClick={() => actions.updateLifecycle("publish")} type="button" variant="brandOutline">Terbitkan</Button> : <Button onClick={() => actions.updateLifecycle("unpublish")} type="button" variant="brandOutline">Jadikan draf</Button>}</div>
      </section>
      {state.lifecycleError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{state.lifecycleError}</p> : null}
      <Tabs className="gap-8" onValueChange={actions.onChangeTab} value={state.activeTab}>
        {state.isQuestionContentLocked ? <Alert><AlertTitle className="text-secondary-900">Bank diterbitkan</AlertTitle><AlertDescription className="text-secondary-900">Untuk validasi ini, isi soal dikunci sampai bank dikembalikan ke draf dari katalog. Metadata dan tag tetap dapat diperbarui.</AlertDescription></Alert> : null}
        <div className="max-w-full overflow-x-auto pb-1"><TabsList className="w-max min-w-full sm:min-w-0"><TabsTrigger className="h-11 rounded-full px-4 text-sm" value="information">Informasi bank</TabsTrigger><TabsTrigger className="h-11 rounded-full px-4 text-sm" value="content">Isi bank <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-800">{builderState.questions.length}</span></TabsTrigger></TabsList></div>
        <TabsContent className="m-0" value="information"><section className="w-full"><div className="grid gap-5 lg:grid-cols-2"><Field><FieldLabel htmlFor="bank-title">Judul bank</FieldLabel><FieldInput id="bank-title" onChange={(event) => actions.updateMetadata("title", event.target.value)} value={builderState.title} /></Field><Field className="lg:col-span-2"><FieldLabel htmlFor="bank-description">Deskripsi</FieldLabel><FieldTextarea className="min-h-[100px]" id="bank-description" onChange={(event) => actions.updateMetadata("description", event.target.value)} value={builderState.description} /></Field></div></section></TabsContent>
        <TabsContent className="m-0" value="content"><section className="grid gap-8 xl:grid-cols-[minmax(270px,0.3fr)_minmax(0,0.7fr)]"><div className="order-2"><div className="flex min-h-11 items-center"><h2 className="text-2xl font-semibold text-secondary-900">Edit soal</h2></div><Tabs className="mt-5 gap-5" onValueChange={actions.onEditorTabChange} value={state.questionEditorTab}><TabsList><TabsTrigger className="rounded-full px-4" value="edit">Edit</TabsTrigger><TabsTrigger className="rounded-full px-4" value="preview">Preview</TabsTrigger></TabsList><TabsContent className="m-0" value="edit"><QuestionBankEditorForm activeQuestionId={state.activeQuestionId} isQuestionContentLocked={state.isQuestionContentLocked} onAddChoice={actions.addChoice} onOpenMedia={actions.onOpenMedia} onRemoveChoice={actions.onRemoveChoice} onRemoveChoiceMedia={actions.onRemoveChoiceMedia} onUpdate={actions.onUpdateDraft} questionDraft={state.questionDraft} /></TabsContent><TabsContent className="m-0" value="preview"><QuestionBankPreview hasSubmittedPreview={state.hasSubmittedPreview} onChoiceChange={actions.onChoiceChange} onSubmit={actions.onSubmitPreview} previewChoiceId={state.previewChoiceId} questionDraft={state.questionDraft} /></TabsContent></Tabs></div><QuestionBankInventory activeQuestionId={state.activeQuestionId} builderState={builderState} inventoryPageCount={state.inventoryPageCount} onAddQuestion={actions.addQuestion} onNextPage={actions.onNextPage} onOpenQuestion={actions.onOpenQuestion} onPreviousPage={actions.onPreviousPage} onRemoveQuestion={actions.onRemoveQuestion} paginatedQuestions={state.paginatedQuestions} visibleInventoryPage={state.visibleInventoryPage} /></section></TabsContent>
      </Tabs>
      <MediaPickerDialog onOpenChange={(open) => { if (!open) actions.onCloseMedia(); }} onSelect={actions.onSelectMedia} open={Boolean(state.mediaPickerTarget)} selectedAssetId={state.selectedMediaAssetId} title={state.mediaPickerTarget?.label ?? "Pilih gambar"} />
      <AlertDialog onOpenChange={(open) => { if (!open) actions.closeConfirmation(); }} open={Boolean(state.confirmationRequest)}><AlertDialogContent size="sm" variant="danger"><AlertDialogHeader><AlertDialogMedia variant="danger"><CircleHelp /></AlertDialogMedia><AlertDialogTitle>{confirmation?.title}</AlertDialogTitle><AlertDialogDescription>{confirmation?.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={actions.closeConfirmation}>Batal</AlertDialogCancel><AlertDialogAction onClick={actions.confirmPendingAction} variant="destructive">{confirmation?.confirmLabel}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </MentorWorkspaceShell>
  );
}

function useQuestionBankNavigationGuards({ hasUnsavedChanges, pendingRouteReplacement, router }: { hasUnsavedChanges: boolean; pendingRouteReplacement: string | null; router: ReturnType<typeof useRouter> }) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!pendingRouteReplacement || hasUnsavedChanges) return;
    const frame = window.requestAnimationFrame(() => router.replace(pendingRouteReplacement));
    return () => window.cancelAnimationFrame(frame);
  }, [hasUnsavedChanges, pendingRouteReplacement, router]);
}

function useQuestionBankPersistence({
  bankId,
  builderState,
  initialBank,
  mode,
  revisionRef,
  setLocalBuilderState,
  updateEditor,
}: {
  bankId?: string;
  builderState: LocalQuestionBankState;
  initialBank: KaptenQuestionBank | null;
  mode: "create" | "edit";
  revisionRef: { current: number | undefined };
  setLocalBuilderState: (state: LocalQuestionBankState) => void;
  updateEditor: (patch: Partial<QuestionBankEditorState>) => void;
}) {
  async function saveDraft() {
    const id =
      initialBank?.id ??
      bankId ??
      `bank-${slugify(builderState.title)}-${Date.now()}`;
    updateEditor({ isSaving: true, lifecycleError: null });
    try {
      const result = await saveQuestionBankAction({ description: builderState.description, id: mode === "edit" ? id : undefined, questions: builderState.questions, revision: revisionRef.current, title: builderState.title });
      if (!result.ok) { updateEditor({ lifecycleError: result.message }); return; }
      setLocalBuilderState({ description: result.result.bank.description, questions: result.result.questions, subjectCode: "PU", title: result.result.bank.title });
      revisionRef.current = result.result.bank.revision;
      updateEditor({ hasUnsavedChanges: false, lifecycleStatus: result.result.bank.status });
      if (mode === "create") updateEditor({ pendingRouteReplacement: `/mentor/quiz/question-bank/${result.result.bank.id}` });
    } catch (saveError) {
      updateEditor({ lifecycleError: saveError instanceof Error ? saveError.message : "Bank Soal belum dapat disimpan." });
    } finally {
      updateEditor({ isSaving: false });
    }
  }

  async function updateLifecycle(operation: "publish" | "unpublish") {
    const id = initialBank?.id ?? bankId;
    if (!id) return;
    const result = await updateQuestionBankLifecycleAction(id, operation);
    if (!result.ok) { updateEditor({ lifecycleError: result.message }); return; }
    updateEditor({ lifecycleError: null, lifecycleStatus: result.result.status });
  }

  return { saveDraft, updateLifecycle };
}

function KaptenQuestionBankBuilderPageModule({
  bankId,
  initialBank = null,
  initialQuestions = [],
  mode,
  session,
}: {
  bankId?: string;
  initialBank?: KaptenQuestionBank | null;
  initialQuestions?: BankQuestion[];
  mode: "create" | "edit";
  session: SessionContext;
}) {
  const router = useRouter();
  const [localBuilderState, setLocalBuilderState] = useState(() => {
    const subjectCode = initialBank?.subjectCode ?? "PU";
    const fallbackQuestionId = `${subjectCode.toLowerCase()}-question-${Date.now()}`;
    const questions = initialQuestions.length
      ? initialQuestions
      : [{ ...emptyQuestion(bankId ?? initialBank?.id ?? fallbackQuestionId, subjectCode), id: fallbackQuestionId }];

    return {
      description: initialBank?.description ?? "",
      questions,
      subjectCode,
      title: initialBank?.title ?? "Bank Soal Baru",
    };
  });
  const initialQuestion = localBuilderState.questions[0]!;
  const [editorState, dispatch] = useReducer(questionBankEditorReducer, {
    activeQuestionId: initialQuestion.id,
    activeTab: "information",
    confirmationRequest: null,
    hasSubmittedPreview: false,
    hasUnsavedChanges: initialQuestions.length === 0,
    inventoryPage: 1,
    isSaving: false,
    lifecycleError: null,
    lifecycleStatus: initialBank?.status ?? "draft",
    mediaPickerTarget: null,
    pendingRouteReplacement: null,
    previewChoiceId: null,
    questionDraft: toQuestionDraft(initialQuestion),
    questionEditorTab: "edit",
  });
  const {
    activeQuestionId,
    activeTab,
    confirmationRequest,
    hasSubmittedPreview,
    hasUnsavedChanges,
    inventoryPage,
    isSaving,
    lifecycleError,
    lifecycleStatus,
    mediaPickerTarget,
    pendingRouteReplacement,
    previewChoiceId,
    questionDraft,
    questionEditorTab,
  } = editorState;
  const updateEditor = (patch: Partial<QuestionBankEditorState>) => dispatch({ patch, type: "patch" });
  const revisionRef = useRef(initialBank?.revision);

  const builderState = localBuilderState;

  const activeQuestion = activeQuestionId
    ? (builderState.questions.find(
        (question) => question.id === activeQuestionId,
      ) ?? null)
    : null;
  const isQuestionContentLocked = lifecycleStatus === "published";
  const isDraftLifecycle = lifecycleStatus === "draft";
  const inventoryPageCount = Math.max(
    1,
    Math.ceil(builderState.questions.length / INVENTORY_QUESTIONS_PER_PAGE),
  );
  const visibleInventoryPage = Math.min(inventoryPage, inventoryPageCount);
  const paginatedQuestions = builderState.questions.slice(
    (visibleInventoryPage - 1) * INVENTORY_QUESTIONS_PER_PAGE,
    visibleInventoryPage * INVENTORY_QUESTIONS_PER_PAGE,
  );
  const selectedQuestionSubject = kaptenSubjects.find(
    (subject) => subject.code === questionDraft.subjectCode,
  );
  const selectedMediaAssetId =
    mediaPickerTarget?.kind === "prompt"
      ? questionDraft.promptMediaAssetId
      : mediaPickerTarget?.kind === "explanation"
        ? questionDraft.explanationMediaAssetId
        : mediaPickerTarget?.kind === "choice"
          ? questionDraft.choices.find(
              (choice) => choice.id === mediaPickerTarget.choiceId,
            )?.mediaAssetId
          : undefined;

  useQuestionBankNavigationGuards({ hasUnsavedChanges, pendingRouteReplacement, router });

  function markChanged(nextState: typeof builderState) {
    setLocalBuilderState(nextState);
    updateEditor({ hasUnsavedChanges: true });
  }

  function updateMetadata(
    field: "title" | "description",
    value: string,
  ) {
    markChanged({ ...builderState, [field]: value });
  }

  function closeConfirmation() {
    updateEditor({ confirmationRequest: null });
  }

  function confirmPendingAction() {
    const pendingRequest = confirmationRequest;

    closeConfirmation();
    pendingRequest?.onConfirm();
  }

  function openQuestion(question: BankQuestion) {
    updateEditor({
      activeQuestionId: question.id,
      hasSubmittedPreview: false,
      previewChoiceId: null,
      questionDraft: toQuestionDraft(question),
      questionEditorTab: "edit",
    });
  }

  function updateQuestionDraft(next: BankQuestion) {
    if (isQuestionContentLocked) return;
    updateEditor({ questionDraft: next });
    if (!activeQuestionId) return;
    markChanged({
      ...builderState,
      questions: builderState.questions.map((question) =>
        question.id === activeQuestionId ? next : question,
      ),
    });
  }

  function selectMediaAsset(asset: MediaAssetDto) {
    if (!mediaPickerTarget) return;

    if (mediaPickerTarget.kind === "prompt") {
      updateQuestionDraft({ ...questionDraft, promptMediaAssetId: asset.id });
      return;
    }

    if (mediaPickerTarget.kind === "explanation") {
      updateQuestionDraft({
        ...questionDraft,
        explanationMediaAssetId: asset.id,
      });
      return;
    }

    updateQuestionDraft({
      ...questionDraft,
      choices: questionDraft.choices.map((choice) =>
        choice.id === mediaPickerTarget.choiceId
          ? { ...choice, mediaAssetId: asset.id }
          : choice,
      ),
    });
  }

  function removeChoiceMedia(choiceId: string) {
    updateQuestionDraft({
      ...questionDraft,
      choices: questionDraft.choices.map((choice) =>
        choice.id === choiceId
          ? { ...choice, mediaAssetId: undefined }
          : choice,
      ),
    });
  }

  function addChoice() {
    if (isQuestionContentLocked || questionDraft.choices.length >= 5) return;
    const id = String.fromCharCode(97 + questionDraft.choices.length);
    updateQuestionDraft({ ...questionDraft, choices: [...questionDraft.choices, { id, text: "" }] });
  }

  function removeChoice(choiceId: string) {
    if (isQuestionContentLocked || questionDraft.choices.length <= 2) return;
    const choices = questionDraft.choices.filter((choice) => choice.id !== choiceId);
    updateQuestionDraft({ ...questionDraft, choices, correctChoiceId: questionDraft.correctChoiceId === choiceId ? choices[0]?.id ?? "a" : questionDraft.correctChoiceId });
  }

  function addQuestion() {
    if (isQuestionContentLocked) return;
    const subjectCode = activeQuestion?.subjectCode ?? builderState.questions.at(-1)?.subjectCode ?? "PU";
    const id = `${subjectCode.toLowerCase()}-question-${Date.now()}`;
    const nextQuestion = {
      ...emptyQuestion(
        bankId ?? initialBank?.id ?? id,
        subjectCode,
      ),
      id,
    };
    markChanged({
      ...builderState,
      questions: [...builderState.questions, nextQuestion],
    });
    updateEditor({
      activeQuestionId: id,
      hasSubmittedPreview: false,
      inventoryPage: Math.ceil((builderState.questions.length + 1) / INVENTORY_QUESTIONS_PER_PAGE),
      previewChoiceId: null,
      questionDraft: nextQuestion,
      questionEditorTab: "edit",
    });
  }

  function removeQuestion(id: string) {
    if (isQuestionContentLocked || builderState.questions.length <= 1) return;
    const questions = builderState.questions.filter(
      (question) => question.id !== id,
    );
    const firstQuestion = questions[0]!;
    markChanged({ ...builderState, questions });
    updateEditor({
      activeQuestionId: firstQuestion.id,
      hasSubmittedPreview: false,
      inventoryPage: 1,
      previewChoiceId: null,
      questionDraft: toQuestionDraft(firstQuestion),
      questionEditorTab: "edit",
    });
  }

  function requestQuestionRemoval(id: string) {
    if (builderState.questions.length <= 1) return;
    const question = builderState.questions.find((item) => item.id === id);
    const questionLabel = question?.prompt || "Soal tanpa pertanyaan";

    updateEditor({ confirmationRequest: {
      confirmLabel: "Hapus soal",
      description: `“${questionLabel}” akan dihapus dari Bank Soal dan tidak dapat dikembalikan.`,
      onConfirm: () => removeQuestion(id),
      title: "Hapus soal ini?",
    } });
  }

  const { saveDraft, updateLifecycle } = useQuestionBankPersistence({
    bankId,
    builderState,
    initialBank,
    mode,
    revisionRef,
    setLocalBuilderState,
    updateEditor,
  });

  return <QuestionBankBuilderScreen
    actions={{
      addChoice,
      addQuestion,
      closeConfirmation,
      confirmPendingAction,
      onChangeTab: (value) => updateEditor({ activeTab: value }),
      onChoiceChange: (value) => updateEditor({ hasSubmittedPreview: false, previewChoiceId: value }),
      onCloseMedia: () => updateEditor({ mediaPickerTarget: null }),
      onEditorTabChange: (value) => updateEditor({ questionEditorTab: value }),
      onNextPage: () => updateEditor({ inventoryPage: visibleInventoryPage + 1 }),
      onOpenMedia: (target) => updateEditor({ mediaPickerTarget: target }),
      onOpenQuestion: openQuestion,
      onPreviousPage: () => updateEditor({ inventoryPage: visibleInventoryPage - 1 }),
      onRemoveChoice: removeChoice,
      onRemoveChoiceMedia: removeChoiceMedia,
      onRemoveQuestion: requestQuestionRemoval,
      onSelectMedia: selectMediaAsset,
      onSubmitPreview: () => updateEditor({ hasSubmittedPreview: true }),
      onUpdateDraft: updateQuestionDraft,
      saveDraft,
      updateLifecycle,
      updateMetadata,
    }}
    builderState={builderState}
    mode={mode}
    session={session}
    state={{ activeQuestionId, activeTab, confirmationRequest, hasSubmittedPreview, hasUnsavedChanges, inventoryPageCount, isQuestionContentLocked, isSaving, isDraftLifecycle, lifecycleError, mediaPickerTarget, paginatedQuestions, pendingRouteReplacement, previewChoiceId, questionDraft, questionEditorTab, selectedMediaAssetId, visibleInventoryPage }}
  />;
}

export { KaptenQuestionBankBuilderPageModule };
