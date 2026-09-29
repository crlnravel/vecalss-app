import {
  MATERI_DOCUMENT_MIME_TYPE,
  normalizeMateriDocumentInput,
  validateMateriVideoInput,
  type MateriDocument,
  type MateriDocumentInput,
} from "@/lib/materi/contract";

type MateriDocumentSource = "hosted" | "managed";

type MateriBuilderState = {
  documentAssetId: string;
  documentMimeType: string;
  documentName: string;
  documentSource: MateriDocumentSource;
  documentUrl: string;
  subjectSlug: string;
  title: string;
  videoDuration: string;
  videoUrl: string;
};

type MateriBuilderField =
  | "documentAssetId"
  | "documentMimeType"
  | "documentUrl"
  | "subjectSlug"
  | "title"
  | "videoDuration"
  | "videoUrl";

type MateriBuilderErrors = Partial<Record<MateriBuilderField, string>>;

function toDocumentInput(state: MateriBuilderState): MateriDocumentInput {
  if (state.documentSource === "managed") {
    return {
      managedAssetId: state.documentAssetId,
      mimeType: state.documentMimeType,
      originalName: state.documentName,
    };
  }

  return {
    hostedUrl: state.documentUrl,
    mimeType: state.documentMimeType,
    originalName: state.documentName,
  };
}

function toPreviewDocument(state: MateriBuilderState): MateriDocument {
  if (state.documentSource === "managed") {
    return {
      managedAssetId: state.documentAssetId.trim() || null,
      mimeType: state.documentMimeType.trim() || MATERI_DOCUMENT_MIME_TYPE,
      originalName: state.documentName.trim() || null,
      sourceKind: "managed",
      url: null,
    };
  }

  return {
    managedAssetId: null,
    mimeType: state.documentMimeType.trim() || MATERI_DOCUMENT_MIME_TYPE,
    originalName: state.documentName.trim() || null,
    sourceKind: "hosted",
    url: state.documentUrl.trim() || null,
  };
}

function validateMateriBuilderState(
  state: MateriBuilderState,
  subjects: readonly { slug: string }[],
): MateriBuilderErrors {
  const errors: MateriBuilderErrors = {};

  if (!subjects.some((subject) => subject.slug === state.subjectSlug)) {
    errors.subjectSlug = "Pilih subtes yang tersedia untuk materi ini.";
  }
  if (!state.title.trim()) {
    errors.title = "Judul materi wajib diisi.";
  }

  const documentValidation = normalizeMateriDocumentInput(toDocumentInput(state));
  if (documentValidation.errors.document) {
    if (state.documentSource === "managed") {
      errors.documentAssetId = documentValidation.errors.document;
    } else {
      errors.documentUrl = documentValidation.errors.document;
    }
  }
  if (documentValidation.errors.documentMimeType) {
    errors.documentMimeType = documentValidation.errors.documentMimeType;
  }
  if (documentValidation.errors.documentUrl) {
    errors.documentUrl = documentValidation.errors.documentUrl;
  }

  const videoValidation = validateMateriVideoInput({
    duration: state.videoDuration,
    url: state.videoUrl,
  });
  if (videoValidation.errors.videoDuration) {
    errors.videoDuration = videoValidation.errors.videoDuration;
  }
  if (videoValidation.errors.videoUrl) {
    errors.videoUrl = videoValidation.errors.videoUrl;
  }

  return errors;
}

export {
  toDocumentInput,
  toPreviewDocument,
  validateMateriBuilderState,
};
export type {
  MateriBuilderErrors,
  MateriBuilderField,
  MateriBuilderState,
  MateriDocumentSource,
};
