import { createHash } from "node:crypto";

import { getTrustedAppBaseUrl } from "@/lib/admin/handoffs/envelope";
import {
  EnrollmentImportPreviewError,
  normalizeImportRoleLabel,
  persistParsedEnrollmentImport,
} from "@/lib/admin/imports";
import {
  CsvContractError,
  getImportTemplateDefinition,
  parseBoundedCsvStream,
} from "@/lib/admin/imports/contracts";
import type { ImportTemplateDefinition } from "@/lib/admin/imports/contracts";
import {
  MultipartRequestError,
  consumeMultipartRequest,
  decodeMultipartField,
} from "@/lib/admin/imports/request";
import { requireAdminReadOnlySession } from "@/lib/auth/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREVIEW_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }

  try {
    return origin === getTrustedAppBaseUrl();
  } catch {
    return false;
  }
}

function errorStatus(code: string) {
  if (code === "request_too_large" || code === "csv_row_limit") {
    return 413;
  }
  if (code === "import_not_found") {
    return 404;
  }
  if (code === "import_not_draft") {
    return 409;
  }
  return 400;
}

function invalidResponse(code: string, status = errorStatus(code)) {
  return Response.json({ error: code }, { headers: PREVIEW_HEADERS, status });
}

export function isPreviewSameOrigin(request: Request) {
  return sameOrigin(request);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return invalidResponse("invalid_origin", 403);
  }

  const session = await requireAdminReadOnlySession();

  try {
    let definition: ReturnType<typeof getImportTemplateDefinition> = null;
    let roleValue: string | null = null;
    let fileCount = 0;
    let sourceFilename: string | null = null;
    let contentHash: string | null = null;
    let records: Awaited<ReturnType<typeof parseBoundedCsvStream>> | null = null;

    await consumeMultipartRequest(request, {
      onField: (part) => {
        if (!["template", "templateVersion", "role"].includes(part.name)) {
          throw new MultipartRequestError("Unexpected multipart field.");
        }
        const value = decodeMultipartField(part);
        if (part.name === "role") {
          if (roleValue !== null) {
            throw new MultipartRequestError("Duplicate multipart fields are not allowed.");
          }
          roleValue = value;
          if (definition && normalizeImportRoleLabel(value) !== definition.role) {
            throw new EnrollmentImportPreviewError("invalid_role");
          }
          return;
        }
        if (definition !== null) {
          throw new MultipartRequestError("Duplicate multipart fields are not allowed.");
        }
        definition = getImportTemplateDefinition(value);
        if (!definition) {
          throw new EnrollmentImportPreviewError("invalid_template");
        }
        if (roleValue !== null && normalizeImportRoleLabel(roleValue) !== definition.role) {
          throw new EnrollmentImportPreviewError("invalid_role");
        }
      },
      onFile: async (part) => {
        if (fileCount > 0 || !["file", "csv", "upload"].includes(part.name) || part.filename === null) {
          throw new MultipartRequestError("Exactly one CSV file is required.");
        }
        if (!definition) {
          throw new MultipartRequestError("The template must precede the CSV file.");
        }
        if (roleValue !== null && normalizeImportRoleLabel(roleValue) !== definition.role) {
          throw new EnrollmentImportPreviewError("invalid_role");
        }
        fileCount += 1;
        sourceFilename = part.filename;
        const hash = createHash("sha256");
        async function* hashedChunks() {
          for await (const chunk of part.data) {
            hash.update(chunk);
            yield chunk;
          }
        }
        records = await parseBoundedCsvStream(hashedChunks(), definition);
        contentHash = hash.digest("hex");
      },
    });

    if (!definition || fileCount !== 1 || !records || !contentHash) {
      throw new MultipartRequestError("Exactly one CSV file and template are required.");
    }
    const selectedDefinition = definition as ImportTemplateDefinition;

    const status = await persistParsedEnrollmentImport({
      actorUserId: session.user.id,
      contentHash,
      records,
      sourceFilename,
      template: selectedDefinition.version,
    });

    return Response.json({ draft: status }, { headers: PREVIEW_HEADERS });
  } catch (error) {
    if (error instanceof EnrollmentImportPreviewError) {
      return invalidResponse(error.code);
    }
    if (error instanceof CsvContractError) {
      const code = error.code === "csv_request_too_large" ? "request_too_large" : error.code;
      return invalidResponse(code);
    }
    if (error instanceof MultipartRequestError) {
      return invalidResponse(error.code);
    }
    return invalidResponse("preview_unavailable", 500);
  }
}
