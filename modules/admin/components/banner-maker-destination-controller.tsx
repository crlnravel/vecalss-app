"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";

import {
  buildBannerMakerDestinationRoute,
  type BannerDestination,
} from "@/lib/banner/destinations";
import {
  BANNER_MAX_LAYERS,
  bannerDesignsEqual,
  createDefaultBannerDesign,
  createTextBannerStarterDesign,
  type BannerAssetView,
  type BannerBootstrap,
  type BannerDesign,
  type BannerMakerDestinationFormState,
  type BannerMakerDestinationSnapshot,
  type BannerRecoveryOption,
  type BannerSourceDescriptor,
} from "@/lib/admin/banner-maker";
import {
  actionResultIsAuthoritative,
  canPublishBannerMakerDestination,
  canSaveBannerMakerDestination,
  createBannerMakerDestinationFormData,
  createBannerMakerRequestId,
  isBannerActionResultForMount,
  validateBannerStarterText,
} from "@/lib/admin/banner-maker-editor-workflow";
import type { MediaAssetDto } from "@/lib/media/types";
import {
  createBannerMakerEditorActions,
  type BannerMakerEditorActions,
} from "./banner-maker-editor-actions";

export type BannerMakerDestinationAction = (
  previousState: BannerMakerDestinationFormState,
  formData: FormData,
) => Promise<BannerMakerDestinationFormState>;

export type BannerMakerDestinationControllerProps = {
  action: BannerMakerDestinationAction;
  requestId?: string;
  snapshot: BannerMakerDestinationSnapshot;
};

type DesignSetter = Dispatch<SetStateAction<BannerDesign>>;
type AssetUrlsSetter = Dispatch<SetStateAction<Record<string, BannerAssetView>>>;
export type BannerMakerDestinationPickerMode = "background" | "image";

function bootstrapSource(bootstrap: BannerBootstrap): BannerSourceDescriptor | null {
  return bootstrap.source;
}

function bootstrapDesign(bootstrap: BannerBootstrap): BannerDesign | null {
  return bootstrap.kind === "valid-design" ? bootstrap.design : null;
}

function starterValues(bootstrap: BannerBootstrap) {
  return bootstrap.kind === "starter-needs-edit"
    ? { description: bootstrap.description, title: bootstrap.title }
    : { description: "", title: "" };
}

export function useDestinationEditorController({
  action,
  requestId: providedRequestId,
  snapshot,
}: BannerMakerDestinationControllerProps) {
  const router = useRouter();
  const destination = snapshot.destination;
  const [requestId] = useState(() => providedRequestId ?? createBannerMakerRequestId());
  const mountIdentityRef = useRef({ destination, requestId });
  const mountedRef = useRef(true);
  const localEditRevisionRef = useRef(0);
  const submittedEditRevisionRef = useRef(0);
  const submittedDesignRef = useRef<BannerDesign | null>(null);
  const pendingSubmissionRef = useRef(false);
  const pendingSwitchRef = useRef<BannerDestination | null>(null);
  const pickerGenerationRef = useRef(0);

  const initialDesign = bootstrapDesign(snapshot.bootstrap);
  const initialRequiresSave = snapshot.bootstrap.kind === "valid-design" && snapshot.bootstrap.requiresSave;
  const initialStarterValues = starterValues(snapshot.bootstrap);
  const [activeBootstrap, setActiveBootstrap] = useState<BannerBootstrap>(snapshot.bootstrap);
  const [correction, setCorrection] = useState(initialStarterValues);
  const [correctionChanged, setCorrectionChanged] = useState(false);
  const [localEditRevision, setLocalEditRevision] = useState(0);
  const [design, setDesign] = useState<BannerDesign | null>(initialDesign);
  const [persistedDesign, setPersistedDesign] = useState<BannerDesign | null>(initialRequiresSave ? null : initialDesign);
  const [assetUrls, setAssetUrls] = useState(snapshot.assetUrls);
  const [revision, setRevision] = useState(snapshot.currentRevision);
  const [source, setSource] = useState<BannerSourceDescriptor | null>(bootstrapSource(snapshot.bootstrap));
  const [requiresSave, setRequiresSave] = useState(initialRequiresSave);
  const [hasSavedDraft, setHasSavedDraft] = useState(snapshot.hasSavedDraft);
  const [savedHasUnpublishedChanges, setSavedHasUnpublishedChanges] = useState(snapshot.hasUnpublishedChanges);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<BannerMakerDestinationPickerMode | null>(null);
  const [pickerGeneration, setPickerGeneration] = useState(0);
  const [showGuides, setShowGuides] = useState(true);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [pendingSwitch, setPendingSwitch] = useState<BannerDestination | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);

  const currentDesignRef = useRef(design);
  useEffect(() => {
    currentDesignRef.current = design;
  }, [design]);

  useEffect(() => {
    localEditRevisionRef.current = localEditRevision;
  }, [localEditRevision]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pickerGenerationRef.current += 1;
    };
  }, []);

  const [formState, formAction, isPending] = useActionState(async (
    previousState: BannerMakerDestinationFormState,
    formData: FormData,
  ) => {
    const submittedEditRevision = submittedEditRevisionRef.current;
    const submittedDesign = submittedDesignRef.current;
    try {
      const nextState = await action(previousState, formData);
      if (!mountedRef.current || !isBannerActionResultForMount(nextState, mountIdentityRef.current)) return previousState;

      if (nextState.status === "success" && nextState.design && submittedDesign) {
        setPersistedDesign(nextState.design);
        setRevision(nextState.currentRevision ?? null);
        setHasSavedDraft(nextState.published !== true);
        setSavedHasUnpublishedChanges(Boolean(nextState.hasUnpublishedChanges));
        setSource(null);
        setRequiresSave(false);
        setActiveBootstrap({ design: nextState.design, kind: "valid-design", requiresSave: false, source: null });

        if (actionResultIsAuthoritative(
          nextState,
          mountIdentityRef.current,
          submittedEditRevision,
          localEditRevisionRef.current,
        ) && bannerDesignsEqual(currentDesignRef.current ?? nextState.design, submittedDesign)) {
          setDesign(nextState.design);
          const nextDestination = pendingSwitchRef.current;
          pendingSwitchRef.current = null;
          if (nextDestination) {
            setPendingSwitch(null);
            router.replace(buildBannerMakerDestinationRoute(nextDestination));
          }
        } else {
          pendingSwitchRef.current = null;
          return {
            ...nextState,
            message: "Draf tersimpan. Perubahan setelah mulai menyimpan tetap dipertahankan di editor.",
          };
        }
      } else if (nextState.status === "error") {
        pendingSwitchRef.current = null;
      }

      return nextState;
    } finally {
      pendingSubmissionRef.current = false;
    }
  }, {
    currentRevision: snapshot.currentRevision,
    destination,
    requestId,
    status: "idle",
  });

  const activeDesign = design ?? createDefaultBannerDesign();
  const canAddLayer = activeDesign.layers.length < BANNER_MAX_LAYERS;
  const markDesignChanged: DesignSetter = (updater) => {
    setLocalEditRevision((current) => current + 1);
    setDesign((current) => {
      const base = current ?? activeDesign;
      return typeof updater === "function" ? updater(base) : updater;
    });
    setRequiresSave((current) => current || persistedDesign === null);
  };
  const setAssetUrlsState: AssetUrlsSetter = setAssetUrls;
  const layerActions = createBannerMakerEditorActions({
    canAddLayer,
    design: activeDesign,
    pickerMode,
    selectedLayerId,
    setAssetUrls: setAssetUrlsState,
    setDesign: markDesignChanged,
    setPickerMode,
    setSelectedLayerId,
  });

  const closePicker = () => {
    pickerGenerationRef.current += 1;
    setPickerGeneration((current) => current + 1);
    setPickerMode(null);
  };
  const openPicker = (mode: BannerMakerDestinationPickerMode) => {
    pickerGenerationRef.current += 1;
    setPickerGeneration((current) => current + 1);
    setPickerMode(mode);
  };
  const handleAssetSelected = (asset: MediaAssetDto, generation: number) => {
    if (generation !== pickerGenerationRef.current || !mountedRef.current) return;
    layerActions.handleAssetSelected(asset);
    pickerGenerationRef.current += 1;
    setPickerMode(null);
  };

  const actions: BannerMakerEditorActions = {
    ...layerActions,
    changeBackground: (background) => markDesignChanged((current) => ({ ...current, background })),
    changeDesign: markDesignChanged,
    changeFrame: (frame) => markDesignChanged((current) => ({ ...current, frame })),
    closePicker,
    openBackgroundPicker: () => openPicker("background"),
    openImagePicker: () => openPicker("image"),
    selectLayer: setSelectedLayerId,
    toggleGuides: () => setShowGuides((current) => !current),
    toggleLeftSidebar: () => setIsLeftSidebarOpen((current) => !current),
  };

  const selectedLayer = activeDesign.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const starterValidation = activeBootstrap.kind === "starter-needs-edit"
    ? validateBannerStarterText(correction.title, correction.description)
    : validateBannerStarterText("valid", "valid");
  const starterInvalid = activeBootstrap.kind === "starter-needs-edit" && !starterValidation.valid;
  const isDirty = starterInvalid
    ? correctionChanged
    : Boolean(design && (requiresSave || !persistedDesign || !bannerDesignsEqual(design, persistedDesign)));
  const canSave = canSaveBannerMakerDestination({ design, isPending, starterInvalid });
  const canPublish = canPublishBannerMakerDestination({
    design,
    hasSavedDraft,
    isDirty,
    isPending,
    starterInvalid,
  });

  const prepareSubmit = () => {
    if (!design || starterInvalid || isPending || pendingSubmissionRef.current) return false;
    pendingSubmissionRef.current = true;
    submittedEditRevisionRef.current = localEditRevisionRef.current;
    submittedDesignRef.current = design;
    return true;
  };

  const submitIntent = (intent: "publish" | "save-draft") => {
    const submittedDesign = design;
    if (!submittedDesign || pendingSubmissionRef.current || (intent === "save-draft" && !canSave) || (intent === "publish" && !canPublish)) return;
    if (!prepareSubmit()) return;
    const formData = createBannerMakerDestinationFormData({
      design: submittedDesign,
      destination,
      intent,
      requestId,
      revision,
      source,
    });
    startTransition(() => formAction(formData));
  };

  const submitSave = () => submitIntent("save-draft");
  const submitPublish = () => submitIntent("publish");

  const invalidatePicker = () => {
    pickerGenerationRef.current += 1;
    setPickerGeneration((current) => current + 1);
    setPickerMode(null);
  };

  const navigateToDestination = (nextDestination: BannerDestination) => {
    if (nextDestination === destination || isPending || pendingSubmissionRef.current) return;
    invalidatePicker();
    if (isDirty) {
      setPendingSwitch(nextDestination);
      return;
    }
    router.replace(buildBannerMakerDestinationRoute(nextDestination));
  };

  const confirmDiscardSwitch = () => {
    if (!pendingSwitch) return;
    const nextDestination = pendingSwitch;
    pendingSwitchRef.current = null;
    setPendingSwitch(null);
    invalidatePicker();
    router.replace(buildBannerMakerDestinationRoute(nextDestination));
  };

  const confirmSaveSwitch = () => {
    if (!pendingSwitch || !canSave || pendingSubmissionRef.current) return;
    pendingSwitchRef.current = pendingSwitch;
    setPendingSwitch(null);
    submitSave();
  };

  const chooseRecovery = (option: BannerRecoveryOption) => {
    if (option.kind === "legacy-published") {
      setLocalEditRevision((current) => current + 1);
      setActiveBootstrap({ design: option.design, kind: "valid-design", requiresSave: true, source: option.source });
      setCorrectionChanged(true);
      setCorrection({ description: "", title: "" });
      setDesign(option.design);
      setPersistedDesign(null);
      setRequiresSave(true);
      setSource(option.source);
      setHasSavedDraft(false);
      setSavedHasUnpublishedChanges(false);
      return;
    }

    setLocalEditRevision((current) => current + 1);
    setActiveBootstrap(option.bootstrap);
    setCorrection(starterValues(option.bootstrap));
    setCorrectionChanged(false);
    setDesign(bootstrapDesign(option.bootstrap));
    setPersistedDesign(null);
    setRequiresSave(option.bootstrap.kind === "valid-design" && option.bootstrap.requiresSave);
    setSource(option.source);
    setHasSavedDraft(false);
    setSavedHasUnpublishedChanges(false);
  };

  const updateStarterText = (field: "description" | "title", value: string) => {
    if (activeBootstrap.kind !== "starter-needs-edit") return;
    const next = { ...correction, [field]: value };
    const validation = validateBannerStarterText(next.title, next.description);
    setCorrection(next);
    setCorrectionChanged(true);
    if (!validation.valid) {
      setDesign(null);
      setRequiresSave(false);
      return;
    }

    const nextDesign = createTextBannerStarterDesign({
      description: next.description,
      destination,
      title: next.title,
    });
    setLocalEditRevision((current) => current + 1);
    setActiveBootstrap({ design: nextDesign, kind: "valid-design", requiresSave: true, source: activeBootstrap.source });
    setDesign(nextDesign);
    setPersistedDesign(null);
    setRequiresSave(true);
  };

  return {
    activeBootstrap,
    actions,
    assetUrls,
    canAddLayer,
    canPublish,
    canSave,
    correction,
    destination,
    design,
    formAction,
    formState,
    isDirty,
    isLeftSidebarOpen,
    isPending,
    pickerGeneration,
    pickerMode,
    prepareSubmit,
    publishDialogOpen,
    revision,
    requestId,
    hasSavedDraft,
    savedHasUnpublishedChanges,
    selectedLayer,
    selectedLayerId,
    selectedPickerAssetId: pickerMode === "background"
      ? activeDesign.background.type === "image" ? activeDesign.background.assetId : null
      : selectedLayer?.type === "image" ? selectedLayer.assetId : null,
    showGuides,
    source,
    starterInvalid,
    starterValidation,
    submitPublish,
    submitSave,
    updateStarterText,
    chooseRecovery,
    handleAssetSelected,
    navigateToDestination,
    pendingSwitch,
    setPendingSwitch,
    setPublishDialogOpen,
    setShowGuides,
    confirmDiscardSwitch,
    confirmSaveSwitch,
  };
}

export type DestinationEditorController = ReturnType<typeof useDestinationEditorController>;
