"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, AlertTriangle, ChevronDown, Plus, Save, Trash2 } from "@/lib/icons";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { MentorBadge } from "@/components/ui/mentor-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { ReferenceStatusBadge } from "@/components/dashboard/reference-dashboard-primitives";
import { cn } from "@/lib/utils";
import { QuestionMobileInventoryOption } from "@/modules/mentor/components/question-mobile-inventory-option";

export type EditorInventoryQuestion = {
  id: string;
  prompt: string;
  issueCount?: number;
};

export function QuestionEditorPageShell({ children, marker }: { children: ReactNode; marker: "quiz" | "tryout" }) {
  return <div className="flex h-screen flex-col overflow-hidden bg-voyage-canvas" data-quiz-editor-shell={marker === "quiz" ? "full-page" : undefined} data-tryout-editor-shell={marker === "tryout" ? "full-page" : undefined}>{children}</div>;
}

export function QuestionEditorHeader({ backControl, category, dirty, onSave, saveDisabled, saveId, saving, title }: {
  backControl: ReactNode;
  category?: string;
  dirty: boolean;
  onSave?: () => void;
  saveDisabled: boolean;
  saveId: string;
  saving: boolean;
  title: string;
}) {
  return <header className="z-10 flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary-100 bg-voyage-canvas/95 px-3 py-2 shadow-[0_10px_24px_-24px_color-mix(in_oklab,var(--voyage-forest)_42%,transparent)] backdrop-blur-xl md:h-14 md:flex-nowrap md:px-6 md:py-0">
    <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
      {backControl}
      <div className="flex min-w-0 items-center gap-2.5">
        <h1 className="max-w-[150px] truncate text-base font-bold text-secondary-900 sm:max-w-xs md:max-w-md">{title}</h1>
        {dirty ? <ReferenceStatusBadge appearance="mentor" label="Belum disimpan" size="xs" status="need_help" /> : null}
        {category ? <MentorBadge className="hidden sm:inline-flex" size="xs" tone="category">{category}</MentorBadge> : null}
      </div>
    </div>
    {onSave ? <div className="flex w-full shrink-0 items-center justify-end gap-2 md:w-auto">
      <Button aria-busy={saving} aria-label="Simpan" disabled={saveDisabled} id={saveId} onClick={onSave} size="sm" title="Simpan perubahan" type="button" variant="brand"><Save aria-hidden="true" />{saving ? "Menyimpan…" : "Simpan"}</Button>
    </div> : null}
  </header>;
}

type InventoryProps = {
  activeQuestionId: string | null;
  addDisabled: boolean;
  addVisible: boolean;
  countLabel: string;
  disabled: boolean;
  emptyLabel: string;
  idPrefix: string;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onSelect: (id: string) => void;
  questions: EditorInventoryQuestion[];
  sourceBankHref?: string;
  sourceBankTitle?: string;
};

function SourceBankLink({ href, title }: { href?: string; title?: string }) {
  if (!href) return null;
  return (
    <p className="max-w-[13rem] truncate text-right text-xs text-secondary-500">
      {title ? "Bank Soal: " : null}
      <Link className="font-semibold text-primary-800 hover:underline" href={href} title={title ?? "Bank Soal yang terhubung"}>
        {title ?? "Bank Soal yang terhubung"}
      </Link>
    </p>
  );
}

export function EditorQuestionInventory(props: InventoryProps) {
  const { activeQuestionId, addDisabled, addVisible, countLabel, disabled, emptyLabel, idPrefix, onAdd, onDelete, onMove, onSelect, questions, sourceBankHref, sourceBankTitle } = props;
  const incompleteCount = questions.filter((question) => (question.issueCount ?? 0) > 0).length;
  return (
    <aside aria-labelledby={`${idPrefix}-inventory-title`} className="flex h-full min-h-0 min-w-0 flex-col rounded-2xl border border-primary-100 bg-white p-3 md:p-4">
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-secondary-900" id={`${idPrefix}-inventory-title`}>Inventori soal</h2>
          <p className="mt-1 text-xs text-secondary-500">{countLabel}{incompleteCount > 0 ? ` · ${incompleteCount} perlu diperbaiki` : ""}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {addVisible ? (
            <Button aria-label="Tambah soal dari Bank Soal" disabled={disabled || addDisabled} id={`${idPrefix}-desktop-add-bank-question`} onClick={onAdd} size="sm" type="button" variant="brandOutline">
              <Plus /><span className="hidden lg:inline">Tambah Soal</span>
            </Button>
          ) : null}
          <SourceBankLink href={sourceBankHref} title={sourceBankTitle} />
        </div>
      </div>
      <nav aria-label="Navigasi soal" className="mt-3 flex min-h-0 flex-1 flex-col">
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1" id={`${idPrefix}-inventory-list`}>
          <ul aria-label="Daftar soal" className="flex flex-col gap-1.5">
            {questions.length ? questions.map((question, index) => {
              const issueCount = question.issueCount ?? 0;
              const isActive = activeQuestionId === question.id;
              return (
                <li className={cn("group flex min-w-0 items-center gap-1 rounded-xl border border-transparent px-2 py-1.5 transition-colors", isActive ? "border-primary-200 bg-primary-50" : issueCount > 0 ? "border-warning-300 bg-warning-50/70 hover:border-warning-400 hover:bg-warning-50" : "hover:border-primary-100 hover:bg-primary-50/60")} key={question.id}>
                  <button aria-current={isActive ? "true" : undefined} aria-label={`Soal ${index + 1}${issueCount ? `, ${issueCount} masalah` : ""}${isActive ? ", dipilih" : ""}`} className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-primary-200" id={`${idPrefix}-question-select-${question.id}`} onClick={() => onSelect(question.id)} type="button">
                    <span className="flex min-w-0 items-center gap-1.5 text-xs font-normal leading-4 text-secondary-900"><span className="min-w-0 flex-1 truncate">{index + 1}. {question.prompt || "Soal tanpa pertanyaan"}</span></span>
                    {issueCount > 0 ? <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5"><MentorBadge aria-label={`Soal ${index + 1} memiliki ${issueCount} masalah`} className="size-7 justify-center !px-0 !py-0" role="img" size="xs" title={`Soal ${index + 1} memiliki ${issueCount} masalah`} tone="attention"><AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" /></MentorBadge></span> : null}
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button aria-label={`Pindah soal ${index + 1} ke atas`} disabled={disabled || index === 0} onClick={() => onMove(question.id, "up")} size="icon-sm" type="button" variant="ghost"><ArrowUp className="size-3.5" /></Button>
                    <Button aria-label={`Pindah soal ${index + 1} ke bawah`} disabled={disabled || index === questions.length - 1} onClick={() => onMove(question.id, "down")} size="icon-sm" type="button" variant="ghost"><ArrowDown className="size-3.5" /></Button>
                    <Button aria-label={`Hapus soal ${index + 1}`} disabled={disabled} onClick={() => onDelete(question.id)} size="icon-sm" type="button" variant="ghost"><Trash2 className="size-3.5" /></Button>
                  </div>
                </li>
              );
            }) : <li className="px-2 py-4 text-sm leading-6 text-secondary-500">{emptyLabel}</li>}
          </ul>
        </div>
      </nav>
    </aside>
  );
}

export function EditorMobileInventory(props: InventoryProps) {
  const { activeQuestionId, addDisabled, addVisible, countLabel, disabled, idPrefix, onAdd, onDelete, onMove, onSelect, questions, sourceBankHref, sourceBankTitle } = props;
  const activeIndex = Math.max(questions.findIndex((question) => question.id === activeQuestionId), 0);
  const activeQuestion = questions[activeIndex] ?? questions[0];
  const incompleteCount = questions.filter((question) => (question.issueCount ?? 0) > 0).length;
  return (
    <div className="border-b border-primary-100 bg-voyage-canvas px-3 py-3 shadow-xs md:hidden">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Pilih soal yang sedang ditinjau" id={`${idPrefix}-mobile-question-picker-trigger`} render={<Button className={cn(REFERENCE_CONTROL_CLASS_NAMES.select, "min-w-0 flex-1")} disabled={questions.length === 0} type="button" variant="reference" />}>
            <span className="min-w-0 truncate">{activeQuestion ? `${activeIndex + 1}. ${activeQuestion.prompt || "Soal tanpa pertanyaan"}` : "Belum ada soal"}</span>
            <ChevronDown className="size-4 shrink-0 text-secondary-400" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[60vh] w-[calc(100vw-4.5rem)] max-w-sm overflow-y-auto">
            <DropdownMenuLabel>Pilih soal</DropdownMenuLabel>
            <DropdownMenuRadioGroup onValueChange={onSelect} value={activeQuestionId ?? undefined}>
              {questions.map((question, index) => <QuestionMobileInventoryOption issueCount={question.issueCount ?? 0} key={question.id} prompt={question.prompt} questionNumber={index + 1} value={question.id} />)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {addVisible ? <Button aria-label="Tambah soal dari Bank Soal" disabled={disabled || addDisabled} id={`${idPrefix}-mobile-add-bank-question`} onClick={onAdd} size="default" type="button" variant="brandOutline"><Plus /><span className="hidden sm:inline">Tambah Soal</span></Button> : null}
          <SourceBankLink href={sourceBankHref} title={sourceBankTitle} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary-500"><span>{countLabel}</span>{incompleteCount > 0 ? <span className="font-semibold text-warning-900">{incompleteCount} perlu diperbaiki</span> : null}</div>
        {activeQuestion ? <div className="flex shrink-0 items-center gap-1">
          <Button aria-label={`Pindah soal ${activeIndex + 1} ke atas`} disabled={disabled || activeIndex <= 0} onClick={() => onMove(activeQuestion.id, "up")} size="icon" title="Pindah ke atas" type="button" variant="ghost"><ArrowUp aria-hidden="true" /></Button>
          <Button aria-label={`Pindah soal ${activeIndex + 1} ke bawah`} disabled={disabled || activeIndex >= questions.length - 1} onClick={() => onMove(activeQuestion.id, "down")} size="icon" title="Pindah ke bawah" type="button" variant="ghost"><ArrowDown aria-hidden="true" /></Button>
          <Button aria-label={`Hapus soal ${activeIndex + 1}`} disabled={disabled} onClick={() => onDelete(activeQuestion.id)} size="icon" title="Hapus soal" type="button" variant="ghost"><Trash2 aria-hidden="true" /></Button>
        </div> : null}
      </div>
    </div>
  );
}

export function QuestionEditorWorkspace({ children, inventory, mobileInventory, mainId }: { children: ReactNode; inventory: ReactNode; mobileInventory: ReactNode; mainId: string }) {
  return <>
    {mobileInventory}
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="hidden w-72 shrink-0 overflow-y-auto border-r border-primary-100 bg-white md:flex md:flex-col lg:w-80 [&_aside]:rounded-none [&_aside]:border-0 [&_aside]:shadow-none">{inventory}</div>
      <main className="flex-1 overflow-y-auto bg-voyage-canvas p-4 sm:p-6 md:p-8" id={mainId} tabIndex={-1}><div className="mx-auto max-w-4xl space-y-6">{children}</div></main>
    </div>
  </>;
}
