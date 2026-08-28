"use client";

import Link from "next/link";
import { ChevronLeft, Save } from "@/lib/icons";
import { useState } from "react";

import {
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
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
  return (
    <div className="space-y-5">
      <Button aria-label="Kembali ke versi Paket" nativeButton={false} render={<Link href={`/mentor/packages/${initialMetadata.id}`} />} size="icon" title="Kembali ke versi Paket" variant="ghost"><ChevronLeft /></Button>
      <ReferencePageHeader
        actions={<Button disabled={saving} onClick={() => void save()} size="sm" variant="reference"><Save />{saving ? "Menyimpan…" : "Simpan informasi"}</Button>}
        description="Ubah judul dan deskripsi Paket. Bank, Subtest, soal, urutan, dan poin dikelola saat membuat versi baru."
        title="Edit Paket Soal"
      />
      <ReferenceSurface as="section" aria-labelledby="package-metadata-heading" className="grid gap-6 p-5 sm:p-7">
        <h2 className="text-xl font-semibold text-secondary-900" id="package-metadata-heading">Informasi Paket</h2>
        {error ? <ReferenceSurface as="div" className="px-4 py-3 text-sm text-danger-600" role="alert" variant="inset">{error}</ReferenceSurface> : null}
        <div className="grid gap-5">
          <Field>
            <FieldLabel htmlFor="package-title">Judul Paket</FieldLabel>
            <FieldInput className={REFERENCE_CONTROL_CLASS_NAMES.input} id="package-title" onChange={(event) => setTitle(event.target.value)} value={title} />
          </Field>
          <Field>
            <FieldLabel htmlFor="package-description">Deskripsi singkat</FieldLabel>
            <FieldInput className={REFERENCE_CONTROL_CLASS_NAMES.input} id="package-description" onChange={(event) => setDescription(event.target.value)} value={description} />
          </Field>
        </div>
        <ReferenceSurface className="p-4" variant="inset">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-secondary-500">Bank</dt><dd className="mt-1 font-semibold text-secondary-900">{initialMetadata.sourceBankName}</dd></div>
            <div><dt className="text-secondary-500">Subtest</dt><dd className="mt-1"><span className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800">{initialMetadata.subtest}</span></dd></div>
          </dl>
        </ReferenceSurface>
      </ReferenceSurface>
    </div>
  );
}

export { KaptenPackageMetadataEditorModule };
