"use client";

import Link from "next/link";
import { useRef, useState, type PointerEvent } from "react";
import { DotsSixVertical } from "@phosphor-icons/react";

import { Plus, Trash2 } from "@/lib/icons";
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
  onMove: (id: string, direction: "up" | "down") => void;
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
    emptyLabel, idPrefix, onAdd, onDelete, onMove, onReorder, onSelect,
    questions, sourceBankHref, sourceBankTitle } = props;
  const listRef = useRef<HTMLOListElement>(null);
  const dragRef = useRef<{ id: string; targetId: string; startY: number; moved: boolean } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const incompleteCount = questions.filter((question) => (question.issueCount ?? 0) > 0).length;

  function trackDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || disabled) return;
    if (Math.abs(event.clientY - drag.startY) < 4 && !drag.moved) return;
    drag.moved = true;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-quiz-inventory-row]");
    if (!target || !listRef.current?.contains(target)) return;
    const targetId = target.dataset.quizInventoryRow;
    if (!targetId) return;
    drag.targetId = targetId;
    setDropTargetId(targetId === drag.id ? null : targetId);
  }

  function finishDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    setDropTargetId(null);
    if (!drag || disabled || !drag.moved || drag.id === drag.targetId) return;
    onReorder(drag.id, drag.targetId);
    const position = questions.findIndex((question) => question.id === drag.targetId) + 1;
    setAnnouncement(`Soal dipindahkan ke urutan ${position}.`);
  }

  function cancelDrag() {
    dragRef.current = null;
    setDropTargetId(null);
  }

  return (
    <aside aria-labelledby={`${idPrefix}-inventory-title`} className={styles.inventory} data-quiz-inventory="reui-editing-1">
      <div className={styles.header}>
        <div className={styles.heading}>
          <h2 id={`${idPrefix}-inventory-title`}>Inventori soal</h2>
          <p>{countLabel}{incompleteCount ? ` · ${incompleteCount} perlu diperbaiki` : ""}</p>
        </div>
        {addVisible ? (
          <button aria-label="Tambah soal dari Bank Soal" className={styles.add} disabled={disabled || addDisabled} id={`${idPrefix}-desktop-add-bank-question`} onClick={onAdd} type="button">
            <Plus aria-hidden="true" /><span>Tambah soal</span>
          </button>
        ) : null}
      </div>
      {sourceBankHref ? <p className={styles.source}>Bank Soal: <Link href={sourceBankHref} title={sourceBankTitle}>{sourceBankTitle ?? "Bank Soal yang terhubung"}</Link></p> : null}
      <p className="sr-only" id={`${idPrefix}-reorder-help`}>Geser pegangan untuk mengubah urutan soal, atau fokuskan pegangan lalu tekan panah atas dan bawah.</p>
      <nav aria-label="Navigasi soal" className={styles.navigation}>
        <ol aria-label="Daftar soal" className={styles.list} id={`${idPrefix}-inventory-list`} ref={listRef}>
          {questions.map((question, index) => {
            const isActive = activeQuestionId === question.id;
            const issueCount = question.issueCount ?? 0;
            return (
              <li className={styles.row} data-active={isActive || undefined} data-incomplete={issueCount > 0 || undefined} data-drop-target={dropTargetId === question.id || undefined} data-quiz-inventory-row={question.id} key={question.id}>
                <button
                  aria-describedby={`${idPrefix}-reorder-help`}
                  aria-label={`Pindah soal ${index + 1}`}
                  className={styles.handle}
                  disabled={disabled || questions.length < 2}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                    event.preventDefault();
                    const direction = event.key === "ArrowUp" ? "up" : "down";
                    const next = index + (direction === "up" ? -1 : 1);
                    if (next < 0 || next >= questions.length) return;
                    onMove(question.id, direction);
                    setAnnouncement(`Soal dipindahkan ke urutan ${next + 1}.`);
                  }}
                  onLostPointerCapture={cancelDrag}
                  onPointerCancel={cancelDrag}
                  onPointerDown={(event) => {
                    if (!event.isPrimary || event.button !== 0 || disabled) return;
                    dragRef.current = { id: question.id, targetId: question.id, startY: event.clientY, moved: false };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={trackDrag}
                  onPointerUp={finishDrag}
                  title="Geser untuk mengubah urutan"
                  type="button"
                ><DotsSixVertical aria-hidden="true" size={16} /></button>
                <button aria-current={isActive ? "true" : undefined} aria-label={`Soal ${index + 1}${issueCount ? `, ${issueCount} masalah` : ""}${isActive ? ", dipilih" : ""}`} className={styles.select} id={`${idPrefix}-question-select-${question.id}`} onClick={() => onSelect(question.id)} title={question.prompt || "Soal tanpa pertanyaan"} type="button">
                  <strong className={styles.number} title={issueCount ? `${issueCount} masalah perlu diperbaiki` : undefined}>{index + 1}</strong>
                  <span className={styles.prompt}>{question.prompt || "Soal tanpa pertanyaan"}</span>
                </button>
                <button aria-label={`Hapus soal ${index + 1}`} className={styles.delete} disabled={disabled} onClick={() => onDelete(question.id)} title="Hapus soal" type="button"><Trash2 aria-hidden="true" /></button>
              </li>
            );
          })}
          {!questions.length ? <li className={styles.empty}>{emptyLabel}</li> : null}
        </ol>
      </nav>
      <span aria-live="polite" className="sr-only" role="status">{announcement}</span>
    </aside>
  );
}
