"use client";

import Link from "next/link";
import { useEffect, type FormEvent } from "react";

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
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReferenceSelect, type ReferenceSelectOption } from "@/components/dashboard/reference-dashboard-controls";
import { REFERENCE_CONTROL_CLASS_NAMES, REFERENCE_FIELD_LABEL_CLASS_NAME } from "@/components/dashboard/reference-dashboard-tokens";
import { showToast } from "@/components/ui/toast";
import { ArrowLeft, CircleHelp, Eye, FileImage, ImagePlus, PenTool, Save, SendHorizontal } from "@/lib/icons";
import {
  BANNER_DESTINATIONS,
  type BannerDestination,
} from "@/lib/banner/destinations";
import { buildAdminStudentPreviewBannerDraftRoute } from "@/lib/student/preview-routes";
import {
  BANNER_MAX_TEXT_LENGTH,
  type BannerBootstrap,
  type BannerMakerDestinationFormState,
  type BannerMakerDestinationSnapshot,
  type BannerRecoveryOption,
} from "@/lib/admin/banner-maker";
import {
  getBannerDestinationLabel,
  handleBannerMakerDestinationSubmit,
  validateBannerStarterText,
} from "@/lib/admin/banner-maker-editor-workflow";
import type { SessionContext } from "@/lib/auth/types";
import { StudentAccountMenu } from "@/modules/student/components/student-account-menu";
import {
  AssetPickerPanel,
  BannerCanvas,
  EditorPropertiesPanel,
  LayerList,
} from "./banner-maker-editor";
import {
  useDestinationEditorController,
  type DestinationEditorController,
} from "./banner-maker-destination-controller";

type BannerMakerDestinationAction = (
  previousState: BannerMakerDestinationFormState,
  formData: FormData,
) => Promise<BannerMakerDestinationFormState>;

type BannerMakerDestinationEditorProps = {
  action: BannerMakerDestinationAction;
  requestId?: string;
  session: SessionContext;
  snapshot: BannerMakerDestinationSnapshot;
};

const destinationOptions: readonly ReferenceSelectOption[] = BANNER_DESTINATIONS.map(({ key }) => ({
  label: getBannerDestinationLabel(key),
  value: key,
}));

function recoveryLabel(option: BannerRecoveryOption) {
  if (option.kind === "legacy-published") return "Pulihkan artwork terbit lama";
  return option.bootstrap.kind === "starter-needs-edit"
    ? "Gunakan starter teks dan perbaiki"
    : "Gunakan starter teks";
}

function starterErrorCopy({ descriptionMissing, titleMissing }: ReturnType<typeof validateBannerStarterText>) {
  const missing: string[] = [];
  if (titleMissing) missing.push("judul");
  if (descriptionMissing) missing.push("deskripsi");
  return missing.length > 0 ? `Isi ${missing.join(" dan ")} sebelum membuka editor.` : null;
}

function StarterCorrectionPanel({
  description,
  issues,
  onChangeDescription,
  onChangeTitle,
  title,
}: {
  description: string;
  issues: ReturnType<typeof validateBannerStarterText>;
  onChangeDescription: (value: string) => void;
  onChangeTitle: (value: string) => void;
  title: string;
}) {
  const titleError = issues.titleMissing || issues.issues.some((issue) => issue.field === "title");
  const descriptionError = issues.descriptionMissing || issues.issues.some((issue) => issue.field === "description");
  const requiredCopy = starterErrorCopy(issues);

  return (
    <section
      aria-labelledby="banner-starter-correction-title"
      className="mx-auto w-full max-w-3xl rounded-[2rem] border border-warning-200 bg-warning-50/70 p-5 shadow-[0_18px_42px_-34px_rgba(91,75,24,0.55)] sm:p-7"
      data-testid="banner-starter-correction"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-warning-100 text-warning-800">
          <FileImage aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold tracking-[-0.03em] text-secondary-950" id="banner-starter-correction-title">
            Perbaiki starter teks sebelum menyimpan
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-700">
            Sumber lama melebihi batas teks banner. Semua karakter tetap dipertahankan; edit isinya sampai valid untuk membuka canvas.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <Field>
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="banner-starter-title">Judul</FieldLabel>
          <Input
            aria-describedby="banner-starter-title-help"
            aria-invalid={titleError}
            className={REFERENCE_CONTROL_CLASS_NAMES.input}
            id="banner-starter-title"
            onChange={(event) => onChangeTitle(event.target.value)}
            value={title}
          />
          <div className="flex items-start justify-between gap-3">
            <FieldError error={issues.issues.find((issue) => issue.field === "title")?.message ?? (issues.titleMissing ? "Judul tidak boleh kosong." : undefined)} id="banner-starter-title-error" />
            <span className="shrink-0 text-xs tabular-nums text-secondary-500" id="banner-starter-title-help">{title.length}/{BANNER_MAX_TEXT_LENGTH}</span>
          </div>
        </Field>
        <Field>
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="banner-starter-description">Deskripsi</FieldLabel>
          <textarea
            aria-describedby="banner-starter-description-help"
            aria-invalid={descriptionError}
            className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-32 resize-y py-3`}
            id="banner-starter-description"
            onChange={(event) => onChangeDescription(event.target.value)}
            value={description}
          />
          <div className="flex items-start justify-between gap-3">
            <FieldError error={issues.issues.find((issue) => issue.field === "description")?.message ?? (issues.descriptionMissing ? "Deskripsi tidak boleh kosong." : undefined)} id="banner-starter-description-error" />
            <span className="shrink-0 text-xs tabular-nums text-secondary-500" id="banner-starter-description-help">{description.length}/{BANNER_MAX_TEXT_LENGTH}</span>
          </div>
        </Field>
      </div>

      {requiredCopy ? <p className="mt-4 text-sm font-medium text-warning-900" role="status">{requiredCopy}</p> : null}
      {issues.valid ? <p className="mt-4 text-sm font-medium text-primary-800" role="status">Teks valid. Canvas siap dibuka dan masih membutuhkan penyimpanan eksplisit.</p> : null}
    </section>
  );
}

function RecoveryPanel({
  bootstrap,
  onChoose,
}: {
  bootstrap: Extract<BannerBootstrap, { kind: "unavailable-recovery" }>;
  onChoose: (option: BannerRecoveryOption) => void;
}) {
  return (
    <section
      aria-labelledby="banner-recovery-title"
      className="mx-auto w-full max-w-3xl rounded-[2rem] border border-student-status-danger-border bg-student-status-danger-bg p-5 shadow-[0_18px_42px_-34px_rgba(154,52,18,0.55)] sm:p-7"
      data-testid="banner-recovery"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/80 text-student-status-danger-fg">
          <CircleHelp aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold tracking-[-0.03em] text-secondary-950" id="banner-recovery-title">Banner perlu dipulihkan</h2>
          <p className="mt-1 text-sm leading-6 text-student-status-danger-fg">{bootstrap.diagnostic}</p>
        </div>
      </div>
      {bootstrap.recoveryOptions.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {bootstrap.recoveryOptions.map((option) => (
            <Button key={`${option.kind}:${option.source.sourceColumn}`} onClick={() => onChoose(option)} type="button" variant="brandOutline">
              {recoveryLabel(option)}
            </Button>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm font-medium text-student-status-danger-fg">Tidak ada sumber pemulihan yang aman. Pertahankan halaman ini dan minta Admin memeriksa data banner.</p>
      )}
    </section>
  );
}

function DestinationSwitchDialog({
  canSave,
  destination,
  onCancel,
  onDiscard,
  onSave,
  pendingDestination,
}: {
  canSave: boolean;
  destination: BannerDestination;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
  pendingDestination: BannerDestination | null;
}) {
  if (!pendingDestination) return null;
  const currentLabel = getBannerDestinationLabel(destination);
  const nextLabel = getBannerDestinationLabel(pendingDestination);
  return (
    <AlertDialog onOpenChange={(open) => { if (!open) onCancel(); }} open>
      <AlertDialogContent data-testid="banner-destination-switch" variant="warning">
        <AlertDialogHeader>
          <AlertDialogMedia variant="warning"><CircleHelp /></AlertDialogMedia>
          <AlertDialogTitle>Perubahan {currentLabel} belum disimpan</AlertDialogTitle>
          <AlertDialogDescription>
            Simpan perubahan sebelum beralih ke {nextLabel}, buang perubahan lokal, atau tetap di editor. Simpan dan beralih hanya akan melanjutkan setelah server mengonfirmasi penyimpanan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-wrap sm:justify-end">
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <Button onClick={onDiscard} type="button" variant="ghost">Buang dan beralih</Button>
          <AlertDialogAction disabled={!canSave} onClick={onSave} variant="brand">Simpan dan beralih</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PublishDialog({
  destination,
  onCancel,
  onConfirm,
}: {
  destination: BannerDestination;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog onOpenChange={(open) => { if (!open) onCancel(); }} open>
      <AlertDialogContent data-testid="banner-publish-confirmation" variant="warning">
        <AlertDialogHeader>
          <AlertDialogMedia variant="warning"><SendHorizontal /></AlertDialogMedia>
          <AlertDialogTitle>Terbitkan banner {getBannerDestinationLabel(destination)}?</AlertDialogTitle>
          <AlertDialogDescription>
            Siswa akan melihat artwork dan teks {getBannerDestinationLabel(destination)} yang tersimpan. Penyimpanan draf dan penerbitan tetap merupakan dua tindakan terpisah.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} variant="brand">Terbitkan {getBannerDestinationLabel(destination)}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DestinationEditorHeader({
  canPublish,
  destination,
  draftPreviewHref,
  isDirty,
  isPending,
  onPublish,
  onSave,
  session,
}: {
  canPublish: boolean;
  destination: BannerDestination;
  draftPreviewHref?: string;
  isDirty: boolean;
  isPending: boolean;
  onPublish: () => void;
  onSave: () => void;
  session: SessionContext;
}) {
  const label = getBannerDestinationLabel(destination);
  return (
    <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-white/15 bg-voyage-deep px-3 py-3 text-white sm:px-4">
      <a aria-label="Kembali ke dashboard admin" className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/35" href="/admin"><ArrowLeft aria-hidden="true" className="size-5" /></a>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Editor banner</p>
        <h1 className="truncate text-base font-semibold">{label}</h1>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {draftPreviewHref ? (
          <Button
            aria-label={`Pratinjau draf ${label}`}
            className="hidden min-h-11 rounded-xl border-white/30 bg-transparent text-white hover:bg-white/10 sm:inline-flex"
            nativeButton={false}
            render={<Link href={draftPreviewHref} />}
            variant="inverseOutline"
          >
            <Eye data-icon="inline-start" />
            <span>Pratinjau draf</span>
          </Button>
        ) : null}
        <Button aria-label={`Simpan draf ${label}`} className="min-h-11 rounded-xl border-white/30 bg-transparent text-white hover:bg-white/10" disabled={!isDirty || isPending} onClick={onSave} type="button" variant="inverseOutline">
          <Save data-icon="inline-start" /><span className="hidden sm:inline">Simpan</span>
        </Button>
        <Button aria-label={`Terbitkan ${label}`} className="min-h-11 rounded-xl border-white/80 bg-white text-primary-800 hover:bg-white/90 focus-visible:border-white focus-visible:ring-white/45" disabled={!canPublish || isPending} onClick={onPublish} type="button" variant="brand">
          <SendHorizontal data-icon="inline-start" /><span>Terbitkan</span>
        </Button>
        <StudentAccountMenu audience="admin" session={session} />
      </div>
    </header>
  );
}

function DestinationEditorStatus({ state }: { state: BannerMakerDestinationFormState }) {
  if (!state.message || state.status === "idle") return null;
  return (
    <div
      aria-live={state.status === "error" ? "assertive" : "polite"}
      className={state.status === "error"
        ? "mx-3 mt-3 rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg sm:mx-5"
        : "mx-3 mt-3 rounded-2xl border border-student-status-success-border bg-student-status-success-bg px-4 py-3 text-sm leading-6 text-student-status-success-fg sm:mx-5"}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </div>
  );
}

function DestinationEditorToolbar({ controller }: { controller: DestinationEditorController }) {
  const { actions } = controller;
  return (
    <div className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-primary-100 bg-white px-3 py-2 sm:px-5">
      <div aria-label="Alat banner" className="flex items-center gap-1">
        <Button aria-label="Tambahkan teks" className="size-11" disabled={!controller.canAddLayer || controller.isPending} onClick={actions.addTextLayer} size="icon" type="button" variant="ghost"><PenTool /></Button>
        <Button aria-label="Impor gambar" className="size-11" disabled={!controller.canAddLayer || controller.isPending} onClick={actions.openImagePicker} size="icon" type="button" variant="ghost"><ImagePlus /></Button>
        <span aria-hidden="true" className="mx-2 h-5 w-px bg-primary-100" />
        <Button aria-label={controller.showGuides ? "Sembunyikan panduan" : "Tampilkan panduan"} aria-pressed={controller.showGuides} className={controller.showGuides ? "size-11 bg-primary-50 text-primary-800" : "size-11"} disabled={controller.isPending} onClick={actions.toggleGuides} size="icon" type="button" variant="ghost"><Eye /></Button>
      </div>
      <p className="text-xs font-medium text-secondary-600" role="status">
        {controller.isPending ? "Menyimpan perubahan…" : controller.isDirty ? "Perubahan belum disimpan" : controller.savedHasUnpublishedChanges ? "Draf belum diterbitkan" : "Banner aktif"}
      </p>
    </div>
  );
}

function DestinationEditorWorkspace({ controller }: { controller: DestinationEditorController }) {
  const { actions } = controller;
  const design = controller.design;
  if (!design) return null;

  return (
    <div className="relative flex min-h-0 flex-1">
      <aside aria-label="Layer banner" className={controller.isLeftSidebarOpen ? "hidden w-64 shrink-0 flex-col border-r border-primary-100 bg-white md:flex xl:w-72" : "hidden w-14 shrink-0 border-r border-primary-100 bg-white md:flex"}>
        <div className="flex min-h-16 shrink-0 items-center justify-between border-b border-primary-100 px-3">
          {controller.isLeftSidebarOpen ? <h2 className="text-sm font-semibold text-secondary-900">Layer</h2> : null}
          <Button aria-label={controller.isLeftSidebarOpen ? "Ciutkan panel layer" : "Buka panel layer"} aria-pressed={controller.isLeftSidebarOpen} className="size-10" onClick={actions.toggleLeftSidebar} size="icon" type="button" variant="ghost">{controller.isLeftSidebarOpen ? <ArrowLeft /> : <ArrowLeft className="rotate-180" />}</Button>
        </div>
        {controller.isLeftSidebarOpen ? <div className="min-h-0 flex-1 overflow-y-auto p-3"><LayerList design={design} onDeleteLayer={actions.deleteLayer} onDropLayer={actions.dropLayer} onMoveDown={(id) => actions.moveLayer(id, "down")} onMoveToBack={(id) => actions.moveLayerToEdge(id, "back")} onMoveToFront={(id) => actions.moveLayerToEdge(id, "front")} onMoveUp={(id) => actions.moveLayer(id, "up")} onSelect={(id) => actions.selectLayer(id)} selectedLayerId={controller.selectedLayerId} /></div> : null}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-voyage-canvas">
        <DestinationEditorToolbar controller={controller} />
        <section aria-label="Area kerja banner" className="flex min-h-72 flex-1 flex-col justify-center px-4 py-8 sm:px-6 lg:py-12 xl:px-8">
          <div className="mx-auto w-full max-w-[1500px]">
            <div className="mb-4 flex items-center justify-between gap-3 text-xs text-secondary-500"><span className="truncate font-medium">{design.name}</span><span className="shrink-0 tabular-nums">{design.frame.width} × {design.frame.height} px</span></div>
            <BannerCanvas assetUrls={controller.assetUrls} design={design} onChange={actions.changeDesign} onDeleteLayer={actions.deleteLayer} onMoveLayer={actions.moveLayer} onMoveToBack={(id) => actions.moveLayerToEdge(id, "back")} onMoveToFront={(id) => actions.moveLayerToEdge(id, "front")} onSelect={actions.selectLayer} showGuides={controller.showGuides} selectedLayerId={controller.selectedLayerId} />
          </div>
        </section>
        <section aria-label="Layer banner" className="border-t border-primary-100 bg-white p-4 md:hidden"><h2 className="mb-3 text-sm font-semibold text-secondary-900">Layer</h2><LayerList design={design} onDeleteLayer={actions.deleteLayer} onDropLayer={actions.dropLayer} onMoveDown={(id) => actions.moveLayer(id, "down")} onMoveToBack={(id) => actions.moveLayerToEdge(id, "back")} onMoveToFront={(id) => actions.moveLayerToEdge(id, "front")} onMoveUp={(id) => actions.moveLayer(id, "up")} onSelect={(id) => actions.selectLayer(id)} selectedLayerId={controller.selectedLayerId} /></section>
        <div className="border-t border-primary-100 bg-white p-4 lg:hidden"><EditorPropertiesPanel assetUrls={controller.assetUrls} background={design.background} frame={design.frame} idPrefix="destination-mobile" layer={controller.selectedLayer} onBackgroundChange={actions.changeBackground} onChangeFrame={actions.changeFrame} onChangeLayer={actions.updateLayer} onDeleteLayer={actions.deleteSelectedLayer} onPickBackgroundImage={actions.openBackgroundPicker} /></div>
      </main>

      <aside aria-label="Edit elemen" className="hidden w-72 shrink-0 overflow-y-auto border-l border-primary-100 bg-white lg:block"><div className="sticky top-0 z-10 flex min-h-16 items-center border-b border-primary-100 bg-white px-4"><h2 className="text-sm font-semibold text-secondary-900">Edit banner</h2></div><div className="p-4"><EditorPropertiesPanel assetUrls={controller.assetUrls} background={design.background} frame={design.frame} idPrefix="destination-desktop" layer={controller.selectedLayer} onBackgroundChange={actions.changeBackground} onChangeFrame={actions.changeFrame} onChangeLayer={actions.updateLayer} onDeleteLayer={actions.deleteSelectedLayer} onPickBackgroundImage={actions.openBackgroundPicker} /></div></aside>
    </div>
  );
}

function DestinationEditorRecovery({ controller }: { controller: DestinationEditorController }) {
  if (controller.activeBootstrap.kind === "unavailable-recovery") {
    return <div className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-12 sm:px-6"><RecoveryPanel bootstrap={controller.activeBootstrap} onChoose={controller.chooseRecovery} /></div>;
  }
  if (controller.activeBootstrap.kind === "starter-needs-edit" && controller.starterInvalid) {
    return <div className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-12 sm:px-6"><StarterCorrectionPanel description={controller.correction.description} issues={controller.starterValidation} onChangeDescription={(value) => controller.updateStarterText("description", value)} onChangeTitle={(value) => controller.updateStarterText("title", value)} title={controller.correction.title} /></div>;
  }
  return <DestinationEditorWorkspace controller={controller} />;
}

function BannerMakerDestinationEditorInstance({ action, requestId, session, snapshot }: BannerMakerDestinationEditorProps) {
  const controller = useDestinationEditorController({ action, requestId, snapshot });
  const { destination } = controller;
  const sourceValue = controller.source;
  const draftPreviewHref = controller.hasSavedDraft && controller.revision
    ? buildAdminStudentPreviewBannerDraftRoute(destination, controller.revision)
    : undefined;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    handleBannerMakerDestinationSubmit({
      canSave: controller.canSave,
      event,
      isDirty: controller.isDirty,
      isPending: controller.isPending,
      prepareSubmit: controller.prepareSubmit,
    });
  };

  useEffect(() => {
    if (!controller.formState.message || controller.formState.status === "idle") return;
    showToast(controller.formState.message, { variant: controller.formState.status === "error" ? "error" : "success" });
  }, [controller.formState.message, controller.formState.status]);

  return (
    <div className="relative h-svh min-h-[38rem] overflow-hidden bg-voyage-canvas text-secondary-900">
      <form action={controller.formAction} className="flex h-full min-h-0 flex-col" onSubmit={handleSubmit}>
        <input name="destination" type="hidden" value={destination} readOnly />
        <input name="requestId" type="hidden" value={controller.requestId} readOnly />
        <input name="revision" type="hidden" value={controller.revision ?? ""} readOnly />
        <input name="source" type="hidden" value={sourceValue ? JSON.stringify(sourceValue) : ""} readOnly />
        <input name="design" type="hidden" value={controller.design ? JSON.stringify(controller.design) : ""} readOnly />
        <input name="intent" type="hidden" value="save-draft" readOnly />
        <DestinationEditorHeader canPublish={controller.canPublish} destination={destination} draftPreviewHref={draftPreviewHref} isDirty={controller.isDirty} isPending={controller.isPending} onPublish={() => controller.setPublishDialogOpen(true)} onSave={controller.submitSave} session={session} />
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-primary-100 bg-white px-3 py-2 sm:px-5">
          <Field className="min-w-0 flex-1 sm:max-w-sm">
            <FieldLabel className="sr-only" htmlFor="banner-destination">Tujuan banner</FieldLabel>
            <ReferenceSelect aria-label="Tujuan banner" className="max-w-sm" disabled={controller.isPending} id="banner-destination" onValueChange={(value) => controller.navigateToDestination(value as BannerDestination)} options={destinationOptions} value={destination} />
          </Field>
          <p className="hidden text-xs font-medium text-secondary-500 sm:block">Perubahan lokal tetap berada di tujuan yang sedang dibuka.</p>
        </div>
        <DestinationEditorStatus state={controller.formState} />
        <DestinationEditorRecovery controller={controller} />
      </form>

      {controller.pickerMode ? <AssetPickerPanel key={`${destination}:${controller.pickerGeneration}`} mode={controller.pickerMode} onClose={controller.actions.closePicker} onSelect={(asset) => controller.handleAssetSelected(asset, controller.pickerGeneration)} selectedAssetId={controller.selectedPickerAssetId} /> : null}
      <DestinationSwitchDialog canSave={controller.canSave} destination={destination} onCancel={() => controller.setPendingSwitch(null)} onDiscard={controller.confirmDiscardSwitch} onSave={controller.confirmSaveSwitch} pendingDestination={controller.pendingSwitch} />
      {controller.publishDialogOpen ? <PublishDialog destination={destination} onCancel={() => controller.setPublishDialogOpen(false)} onConfirm={() => { controller.setPublishDialogOpen(false); controller.submitPublish(); }} /> : null}
    </div>
  );
}

function BannerMakerDestinationEditor(props: BannerMakerDestinationEditorProps) {
  return <BannerMakerDestinationEditorInstance key={props.snapshot.destination} {...props} />;
}

export { BannerMakerDestinationEditor, useDestinationEditorController };
export type { BannerMakerDestinationAction, BannerMakerDestinationEditorProps };
