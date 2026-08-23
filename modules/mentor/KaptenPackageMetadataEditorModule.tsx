"use client";

import Link from "next/link";
import { ChevronLeft, Save } from "@/lib/icons";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { saveReusableQuestionPackageMetadataAction } from "@/modules/mentor/tryout-actions";

type PackageMetadata = { description: string; id: string; sourceBankName: string; subtest: string; title: string };

function KaptenPackageMetadataEditorModule({ initialMetadata }: { initialMetadata: PackageMetadata }) {
  const [description, setDescription] = useState(initialMetadata.description);
  const [title, setTitle] = useState(initialMetadata.title);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true); setError(null);
    try {
      const result = await saveReusableQuestionPackageMetadataAction({ description, id: initialMetadata.id, title });
      if (!result.ok) setError(result.message);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Informasi Paket belum dapat disimpan.");
    } finally {
      setSaving(false);
    }
  };
  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3"><Button aria-label="Kembali ke versi Paket" nativeButton={false} render={<Link href={`/mentor/packages/${initialMetadata.id}`} />} size="icon" title="Kembali ke versi Paket" variant="ghost"><ChevronLeft /></Button><Button disabled={saving} onClick={() => void save()} size="sm" variant="brand"><Save />{saving ? "Menyimpan…" : "Simpan informasi"}</Button></div>
    <section className="mt-3 rounded-3xl border border-primary-100 bg-white p-5 sm:p-7"><p className="text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Informasi Paket</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-secondary-900">Edit Paket Soal</h1><p className="mt-2 text-sm text-secondary-500">Ubah judul dan deskripsi Paket. Bank, Subtest, soal, urutan, dan poin dikelola saat membuat versi baru.</p>{error ? <p className="mt-4 rounded-2xl border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm text-danger-600" role="alert">{error}</p> : null}<div className="mt-6 grid gap-4"><Field><FieldLabel htmlFor="package-title">Judul Paket</FieldLabel><FieldInput id="package-title" onChange={(event) => setTitle(event.target.value)} value={title} /></Field><Field><FieldLabel htmlFor="package-description">Deskripsi singkat</FieldLabel><FieldInput id="package-description" onChange={(event) => setDescription(event.target.value)} value={description} /></Field></div><dl className="mt-6 grid gap-3 border-t border-primary-100 pt-5 text-sm sm:grid-cols-2"><div><dt className="text-secondary-500">Bank</dt><dd className="mt-1 font-semibold text-secondary-900">{initialMetadata.sourceBankName}</dd></div><div><dt className="text-secondary-500">Subtest</dt><dd className="mt-1"><span className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800">{initialMetadata.subtest}</span></dd></div></dl></section>
  </div>;
}

export { KaptenPackageMetadataEditorModule };
