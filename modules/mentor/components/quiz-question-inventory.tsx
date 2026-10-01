"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sortable, SortableHandle, SortableItem } from "@/components/ui/sortable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GripVertical, Plus, Trash2 } from "@/lib/icons";
import type { EditorInventoryQuestion } from "@/modules/mentor/components/question-editor-workspace";
import styles from "./quiz-question-inventory.module.css";

type QuizInventoryProps = {
  activeQuestionId: string | null;
  addDisabled: boolean;
  addVisible: boolean;
  countLabel: string;
  disabled: boolean;
  emptyLabel: string;
  idPrefix: string;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, targetId: string) => void;
  onSelect: (id: string) => void;
  questions: EditorInventoryQuestion[];
  sourceBankHref?: string;
  sourceBankTitle?: string;
};

// Visual reference: https://reui.io/preview/base/data-grid-editing-1.
// The quiz uses question numbers in place of tags and omits the pencil action.
export function QuizMobileInventory(props: QuizInventoryProps) {
  const activeIndex = props.questions.findIndex((question) => question.id === props.activeQuestionId);
  return (
    <details className={`${styles.mobile} md:hidden`}>
      <summary id="quiz-mobile-question-picker-trigger">Inventori soal <span>{activeIndex >= 0 ? `Soal ${activeIndex + 1} dari ${props.questions.length}` : "Belum ada soal"}</span></summary>
      <div className={styles.mobileContent}>
        <QuizQuestionInventory {...props} idPrefix={`${props.idPrefix}-mobile`} />
      </div>
    </details>
  );
}

export function QuizQuestionInventory(props: QuizInventoryProps) {
  const { activeQuestionId, addDisabled, addVisible, countLabel, disabled,
    emptyLabel, idPrefix, onAdd, onDelete, onReorder, onSelect,
    questions, sourceBankHref, sourceBankTitle } = props;
  const incompleteCount = questions.filter((question) => (question.issueCount ?? 0) > 0).length;

  return (
    <aside aria-labelledby={`${idPrefix}-inventory-title`} className={styles.inventory} data-quiz-inventory="reui-editing-1">
      <div className={styles.header}>
        <div className={styles.heading}>
          <h2 id={`${idPrefix}-inventory-title`}>Inventori soal</h2>
          <p>{countLabel}{incompleteCount ? ` · ${incompleteCount} perlu diperbaiki` : ""}</p>
        </div>
        {addVisible ? (
          <Button aria-label="Tambah soal dari Bank Soal" className="max-md:min-h-11" disabled={disabled || addDisabled} id={`${idPrefix}-desktop-add-bank-question`} onClick={onAdd} size="xs" type="button" variant="outline">
            <Plus aria-hidden="true" /><span>Tambah soal</span>
          </Button>
        ) : null}
      </div>
      {sourceBankHref ? <p className={styles.source}>Bank Soal: <Link href={sourceBankHref} title={sourceBankTitle}>{sourceBankTitle ?? "Bank Soal yang terhubung"}</Link></p> : null}
      <nav aria-label="Navigasi soal" className={styles.navigation}>
        <Sortable disabled={disabled || questions.length < 2} getItemLabel={(id) => `Soal ${questions.findIndex((question) => question.id === id) + 1}`} items={questions.map((question) => question.id)} onReorder={onReorder}>
        <ol aria-label="Daftar soal" className={styles.list} id={`${idPrefix}-inventory-list`}>
          {questions.map((question, index) => {
            const isActive = activeQuestionId === question.id;
            const issueCount = question.issueCount ?? 0;
            return (
              <SortableItem className={styles.row} data-active={isActive || undefined} data-incomplete={issueCount > 0 || undefined} data-quiz-inventory-row={question.id} key={question.id} render={<li />} value={question.id}>
                <SortableHandle
                  aria-label={`Pindah soal ${index + 1}`}
                  className="max-md:size-11"
                  type="button"
                ><GripVertical aria-hidden="true" /></SortableHandle>
                <Button aria-current={isActive ? "true" : undefined} aria-label={`Soal ${index + 1}, ${question.prompt || "Soal tanpa pertanyaan"}${issueCount ? `, ${issueCount} masalah` : ""}${isActive ? ", dipilih" : ""}`} className={`h-auto min-h-10 min-w-0 flex-1 justify-start gap-2 px-0 text-xs font-normal max-md:min-h-11 ${styles.select}`} id={`${idPrefix}-question-select-${question.id}`} onClick={() => onSelect(question.id)} type="button" variant="quiet">
                  <strong className={styles.number}>{index + 1}</strong>
                  <span className={styles.prompt}>{question.prompt || "Soal tanpa pertanyaan"}</span>
                </Button>
                <Tooltip>
                <TooltipTrigger render={<Button aria-label={`Hapus soal ${index + 1}`} className="max-md:size-11" disabled={disabled} onClick={() => onDelete(question.id)} size="icon-sm" type="button" variant="quiet" />}><Trash2 aria-hidden="true" /></TooltipTrigger>
                <TooltipContent>Hapus soal</TooltipContent>
                </Tooltip>
              </SortableItem>
            );
          })}
          {!questions.length ? <li className={styles.empty}>{emptyLabel}</li> : null}
        </ol>
        </Sortable>
      </nav>
    </aside>
  );
}
