import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EnrollmentImportOperation,
  EnrollmentImportRole,
  EnrollmentImportRowStatus,
  RoleName,
  UserStatus,
} from "@/generated/prisma/client";
import {
  FIELD_LIMITS,
  MAX_DATA_ROWS,
  MAX_REQUEST_BYTES,
  STUDENT_DISPLAY_NAME_MAX,
  getImportTemplateDefinition,
  isImportIdUuid,
  parseBoundedCsv,
  parseBoundedCsvStream,
  safeImportFilename,
  sha256Hex,
  truncateCodePoints,
} from "@/lib/admin/imports/contracts";
import {
  PREVIEW_METADATA_KEY,
  evaluatePreviewRows,
} from "@/lib/admin/imports/service";
import {
  consumeMultipartRequest,
  decodeMultipartField,
  MultipartRequestError,
} from "@/lib/admin/imports/request";

async function* splitBytes(bytes: Uint8Array, size: number) {
  for (let offset = 0; offset < bytes.byteLength; offset += size) {
    yield bytes.slice(offset, Math.min(offset + size, bytes.byteLength));
  }
}

function assertWellFormedUtf16(value: string) {
  assert.doesNotThrow(() => encodeURIComponent(value));
}

const students = getImportTemplateDefinition("students.v1");
const kapten = getImportTemplateDefinition("kapten.v1");
if (!students || !kapten) {
  throw new Error("The import test templates are unavailable.");
}
assert.deepEqual(students.headers, ["email", "full_name", "target_exam"]);
assert.deepEqual(kapten.headers, ["email", "full_name", "phone", "headline", "bio"]);
assert.equal(getImportTemplateDefinition("students.v1.csv")?.version, "students.v1");

const quoted = new TextEncoder().encode(
  "\ufeffemail,full_name,target_exam\r\n\"A@Example.COM\",\"Doe, José\",\"UTBK 2026\"\r\n",
);
const quotedRows = parseBoundedCsv(quoted, students);
assert.equal(quotedRows[0].input.email, "a@example.com");
assert.equal(quotedRows[0].input.full_name, "Doe, José");
assert.equal("target_exam" in quotedRows[0].input && quotedRows[0].input.target_exam, "UTBK 2026");
const streamedRows = await parseBoundedCsvStream(splitBytes(quoted, 1), students);
assert.deepEqual(streamedRows, quotedRows);
const oversized = parseBoundedCsv(new TextEncoder().encode(`email,full_name,target_exam\n${"a".repeat(FIELD_LIMITS.email + 20)}@example.com,${"n".repeat(FIELD_LIMITS.full_name + 20)},`), students);
assert.equal(oversized[0].validationError, "invalid_email");
assert.equal(oversized[0].input.email.length <= FIELD_LIMITS.email, true);
assert.equal(oversized[0].input.full_name.length, STUDENT_DISPLAY_NAME_MAX);
const studentNameBoundary = parseBoundedCsv(new TextEncoder().encode([
  "email,full_name,target_exam",
  `boundary@example.com,${"n".repeat(STUDENT_DISPLAY_NAME_MAX)},`,
  `too-long@example.com,${"n".repeat(STUDENT_DISPLAY_NAME_MAX + 1)},`,
].join("\n")), students);
assert.equal(studentNameBoundary[0].validationError, null);
assert.equal(studentNameBoundary[0].input.full_name.length, STUDENT_DISPLAY_NAME_MAX);
assert.equal(studentNameBoundary[1].validationError, "field_too_long");
assert.equal(studentNameBoundary[1].input.full_name.length, STUDENT_DISPLAY_NAME_MAX);

assert.throws(
  () => parseBoundedCsv(new TextEncoder().encode("email,full_name,target_exam\n\"broken\n"), students),
  (error: unknown) => error instanceof Error && error.name === "CsvContractError",
);
assert.throws(
  () => parseBoundedCsv(new TextEncoder().encode("email,full_name\na@example.com,A\n"), students),
  (error: unknown) => error instanceof Error && error.name === "CsvContractError",
);

const rows500 = ["email,full_name,target_exam", ...Array.from({ length: MAX_DATA_ROWS }, (_, index) => `person${index}@example.com,Person ${index},`)].join("\n");
assert.equal(parseBoundedCsv(new TextEncoder().encode(rows500), students).length, MAX_DATA_ROWS);
const rows501 = `${rows500}\nperson501@example.com,Person 501,`;
assert.throws(
  () => parseBoundedCsv(new TextEncoder().encode(rows501), students),
  (error: unknown) => error instanceof Error && error.name === "CsvContractError" && /500/u.test(error.message),
);
assert.equal(MAX_REQUEST_BYTES, 2 * 1024 * 1024);
assert.throws(
  () => parseBoundedCsv(new Uint8Array(MAX_REQUEST_BYTES + 1), students),
  (error: unknown) => error instanceof Error && /request is too large/u.test(error.message),
);
const streamedRows501 = `${rows500}\nperson501@example.com,Person 501,`;
await assert.rejects(
  parseBoundedCsvStream(splitBytes(new TextEncoder().encode(streamedRows501), 7), students),
  (error: unknown) => error instanceof Error && error.name === "CsvContractError" && /500/u.test(error.message),
);
const controlRows = parseBoundedCsv(new TextEncoder().encode("email,full_name,target_exam\nctrl\u0000@example.com,Name\u0000,\u0000"), students);
assert.equal(controlRows[0].validationError, "field_contains_control_character");
assert.equal(JSON.stringify(controlRows[0].input).includes("\u0000"), false);
assert.equal(controlRows[0].input.email, "ctrl@example.com");
assert.equal(sha256Hex(new TextEncoder().encode("x")), "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881");
assert.equal(safeImportFilename("../../evil\\roster.csv"), "roster.csv");
assert.ok(safeImportFilename("\u0000"));

const records = parseBoundedCsv(new TextEncoder().encode([
  "email,full_name,target_exam",
  "DUP@example.com,Duplicate One,",
  "dup@example.com,Duplicate Two,",
  "same@example.com,Same,UTBK",
  "opposite@example.com,Opposite,",
  "deleted@example.com,Deleted,",
  "revoked@example.com,Revoked,",
  "new@example.com,New,Missing",
].join("\n")), students);
const now = new Date("2026-01-01T00:00:00.000Z");
const evaluated = evaluatePreviewRows({
  definition: students,
  examEvents: [
    { id: "exam-1", name: "UTBK" },
    { id: "exam-2", name: "utbk" },
  ],
  existingUsers: [
    {
      email: "same@example.com",
      id: "same-user",
      roleAssignments: [{ assignedAt: now, id: "same-role", revokedAt: null, role: RoleName.student }],
      softDeletedAt: null,
      status: UserStatus.active,
      updatedAt: now,
    },
    {
      email: "opposite@example.com",
      id: "opposite-user",
      roleAssignments: [{ assignedAt: now, id: "opposite-role", revokedAt: null, role: RoleName.tutor }],
      softDeletedAt: null,
      status: UserStatus.active,
      updatedAt: now,
    },
    {
      email: "deleted@example.com",
      id: "deleted-user",
      roleAssignments: [{ assignedAt: now, id: "deleted-role", revokedAt: null, role: RoleName.student }],
      softDeletedAt: now,
      status: UserStatus.soft_deleted,
      updatedAt: now,
    },
    {
      email: "revoked@example.com",
      id: "revoked-user",
      roleAssignments: [{ assignedAt: now, id: "revoked-role", revokedAt: now, role: RoleName.student }],
      softDeletedAt: null,
      status: UserStatus.active,
      updatedAt: now,
    },
  ],
  records,
});
assert.equal(evaluated[0].errorCode, "duplicate_email_in_file");
assert.equal(evaluated[1].errorCode, "duplicate_email_in_file");
assert.equal(evaluated[2].errorCode, "ambiguous_exam");
assert.equal(evaluated[3].errorCode, "opposite_role");
assert.equal(evaluated[4].errorCode, "soft_deleted_user");
assert.equal(evaluated[5].errorCode, "revoked_role");
assert.equal(evaluated[6].errorCode, "exam_not_found");
assert.equal(evaluated[2].status, EnrollmentImportRowStatus.invalid);
assert.equal(evaluated[3].operation, EnrollmentImportOperation.none);
assert.equal(evaluated[0].inputJson && typeof evaluated[0].inputJson === "object" && PREVIEW_METADATA_KEY in evaluated[0].inputJson, true);

const kaptenRows = parseBoundedCsv(new TextEncoder().encode("email,full_name,phone,headline,bio\nkapten@example.com,Kapten,+62,Lead,\"line one\nline two\""), kapten);
assert.equal("bio" in kaptenRows[0].input && kaptenRows[0].input.bio, "line one\nline two");
assert.equal(FIELD_LIMITS.bio, 2_000);
assert.equal(EnrollmentImportRole.tutor, "tutor");
const kaptenControlRows = parseBoundedCsv(new TextEncoder().encode("email,full_name,phone,headline,bio\nkap\u0000@example.com,Name\u0000,+62\u0000,Lead\u0000,Bio\u0000"), kapten);
assert.equal(kaptenControlRows[0].validationError, "field_contains_control_character");
assert.equal(JSON.stringify(kaptenControlRows[0].input).includes("\u0000"), false);
assert.deepEqual(kaptenControlRows[0].input, {
  bio: "Bio",
  email: "kap@example.com",
  full_name: "Name",
  headline: "Lead",
  phone: "+62",
});
const astralStudents = parseBoundedCsv(new TextEncoder().encode([
  "email,full_name,target_exam",
  `${"a".repeat(250)}😀@x.com,${"n".repeat(119)}😀x,${"e".repeat(159)}😀x`,
].join("\n")), students);
assert.equal(astralStudents[0].validationError, "invalid_email");
const astralStudentInput = astralStudents[0].input;
assert("target_exam" in astralStudentInput);
assertWellFormedUtf16(astralStudentInput.email);
assertWellFormedUtf16(astralStudentInput.full_name);
assertWellFormedUtf16(astralStudentInput.target_exam ?? "");
assert.equal(astralStudentInput.full_name.endsWith("😀"), true);
assert.equal(astralStudentInput.target_exam?.endsWith("😀"), true);
const astralKapten = parseBoundedCsv(new TextEncoder().encode([
  "email,full_name,phone,headline,bio",
  `astral@example.com,${"n".repeat(159)}😀x,${"p".repeat(39)}😀x,${"h".repeat(159)}😀x,${"b".repeat(1_999)}😀x`,
].join("\n")), kapten);
assert.equal(astralKapten[0].validationError, "field_too_long");
const astralKaptenInput = astralKapten[0].input;
assert("phone" in astralKaptenInput);
for (const value of Object.values(astralKaptenInput)) {
  if (typeof value === "string") {
    assertWellFormedUtf16(value);
  }
}
assert.equal(astralKaptenInput.full_name.endsWith("😀"), true);
assert.equal(astralKaptenInput.phone?.endsWith("😀"), true);
assert.equal(astralKaptenInput.headline?.endsWith("😀"), true);
assert.equal(astralKaptenInput.bio?.endsWith("😀"), true);
const astralFilename = safeImportFilename(`${"f".repeat(119)}𠀀.csv`);
assertWellFormedUtf16(astralFilename);
assert.equal(astralFilename.endsWith("𠀀"), true);
assert.equal(truncateCodePoints("a😀b", 2), "a😀");
assert.equal(isImportIdUuid("550e8400-e29b-41d4-a716-446655440000"), true);
assert.equal(isImportIdUuid("not-a-uuid"), false);

const multipartBoundary = "streaming-import-boundary";
const multipartCsv = "email,full_name,target_exam\r\nstream@example.com,Stream User,\r\n";
const multipartBody = new TextEncoder().encode([
  `--${multipartBoundary}\r\nContent-Disposition: form-data; name="template"\r\n\r\nstudents.v1\r\n`,
  `--${multipartBoundary}\r\nContent-Disposition: form-data; name="role"\r\n\r\nstudent\r\n`,
  `--${multipartBoundary}\r\nContent-Disposition: form-data; name="file"; filename="stream.csv"\r\nContent-Type: text/csv\r\n\r\n${multipartCsv}\r\n`,
  `--${multipartBoundary}--\r\n`,
].join(""));
const multipartRequest = new Request("http://localhost/api/admin/imports/preview", {
  body: new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < multipartBody.byteLength; offset += 3) {
        controller.enqueue(multipartBody.slice(offset, offset + 3));
      }
      controller.close();
    },
  }),
  duplex: "half",
  headers: {
    "content-type": `multipart/form-data; boundary=${multipartBoundary}`,
  },
  method: "POST",
} as RequestInit);
const multipartFields: Record<string, string> = {};
let multipartFile = new Uint8Array();
await consumeMultipartRequest(multipartRequest, {
  onField(part) {
    multipartFields[part.name] = decodeMultipartField(part) ?? "";
  },
  async onFile(part) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of part.data) {
      chunks.push(chunk);
    }
    multipartFile = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) {
      multipartFile.set(chunk, offset);
      offset += chunk.byteLength;
    }
  },
});
assert.deepEqual(multipartFields, { role: "student", template: "students.v1" });
assert.equal(new TextDecoder().decode(multipartFile), multipartCsv);
let producerCancelled = false;
const earlyRejectBoundary = "early-reject-boundary";
const earlyRejectPrefix = new TextEncoder().encode([
  `--${earlyRejectBoundary}\r\nContent-Disposition: form-data; name="file"; filename="bad.csv"\r\nContent-Type: text/csv\r\n\r\n`,
  `wrong,header\n${"x".repeat(100)}`,
].join(""));
const earlyRejectRequest = new Request("http://localhost", {
  body: new ReadableStream<Uint8Array>({
    cancel() {
      producerCancelled = true;
    },
    start(controller) {
      controller.enqueue(earlyRejectPrefix);
    },
  }),
  duplex: "half",
  headers: { "content-type": `multipart/form-data; boundary=${earlyRejectBoundary}` },
  method: "POST",
} as RequestInit);
await assert.rejects(
  consumeMultipartRequest(earlyRejectRequest, {
    onField() {},
    onFile: async (part) => {
      await parseBoundedCsvStream(part.data, students);
    },
  }),
  (error: unknown) => error instanceof Error && error.name === "CsvContractError",
);
assert.equal(producerCancelled, true);
const missingBoundaryBody = new TextEncoder().encode([
  `--${earlyRejectBoundary}\r\nContent-Disposition: form-data; name="file"; filename="valid.csv"\r\nContent-Type: text/csv\r\n\r\n`,
  `email,full_name,target_exam\nvalid@example.com,Name,Exam\n${"x".repeat(100)}`,
].join(""));
await assert.rejects(
  consumeMultipartRequest(new Request("http://localhost", {
    body: missingBoundaryBody,
    headers: { "content-type": `multipart/form-data; boundary=${earlyRejectBoundary}` },
    method: "POST",
  }), {
    onField() {},
    onFile: async (part) => {
      await parseBoundedCsvStream(part.data, students);
    },
  }),
  (error: unknown) => error instanceof MultipartRequestError && /closing boundary is missing/u.test(error.message),
);
const fileHeadersOnly = [
  `--${earlyRejectBoundary}\r\nContent-Disposition: form-data; name="file"; filename="empty.csv"\r\nContent-Type: text/csv\r\n\r\n`,
];
for (const body of [
  new TextEncoder().encode(`${fileHeadersOnly.join("")}x`),
  new TextEncoder().encode(fileHeadersOnly.join("")),
]) {
  await assert.rejects(
    consumeMultipartRequest(new Request("http://localhost", {
      body,
      headers: { "content-type": `multipart/form-data; boundary=${earlyRejectBoundary}` },
      method: "POST",
    }), {
      onField() {},
      onFile: async (part) => {
        await parseBoundedCsvStream(part.data, students);
      },
    }),
    (error: unknown) => error instanceof MultipartRequestError && /closing boundary is missing/u.test(error.message),
  );
}
await assert.rejects(
  consumeMultipartRequest(new Request("http://localhost", {
    body: new TextEncoder().encode("x".repeat(MAX_REQUEST_BYTES + 1)),
    headers: { "content-type": `multipart/form-data; boundary=${multipartBoundary}` },
    method: "POST",
  }), { onField() {}, onFile() {} }),
  (error: unknown) => error instanceof MultipartRequestError && error.code === "request_too_large",
);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [serviceSource, previewRouteSource, statusRouteSource, skipRouteSource, templateRouteSource, accessSource, sessionSource] = await Promise.all([
  readFile(resolve(root, "lib/admin/imports/service.ts"), "utf8"),
  readFile(resolve(root, "app/api/admin/imports/preview/route.ts"), "utf8"),
  readFile(resolve(root, "app/api/admin/imports/[importId]/route.ts"), "utf8"),
  readFile(resolve(root, "app/api/admin/imports/[importId]/rows/skip/route.ts"), "utf8"),
  readFile(resolve(root, "app/api/admin/imports/templates/[template]/route.ts"), "utf8"),
  readFile(resolve(root, "lib/auth/access.ts"), "utf8"),
  readFile(resolve(root, "lib/auth/session.ts"), "utf8"),
]);
assert.match(previewRouteSource, /requireAdminReadOnlySession/);
assert.doesNotMatch(previewRouteSource, /requireAdminSession\(/u);
assert.doesNotMatch(previewRouteSource, /readRequestBytesAtMost|parseMultipartBody/u);
assert.match(previewRouteSource, /sameOrigin/);
assert.match(statusRouteSource, /requireAdminReadOnlySession/);
assert.match(statusRouteSource, /isImportIdUuid/);
assert.match(serviceSource, /createdByUserId/);
assert.match(skipRouteSource, /sameOrigin/);
assert.match(skipRouteSource, /skipInvalidEnrollmentImportRows/);
assert.match(skipRouteSource, /requireAdminReadOnlySession/);
assert.match(skipRouteSource, /isImportIdUuid/);
assert.match(templateRouteSource, /requireAdminReadOnlySession/);
assert.match(accessSource, /requireAdminReadOnlySession/);
assert.match(sessionSource, /getReadOnlySessionContext/);
const normalSessionSource = sessionSource.slice(sessionSource.indexOf("async function getSessionContext"), sessionSource.indexOf("async function getReadOnlySessionContextForToken"));
assert.match(normalSessionSource, /session\.user\.softDeletedAt !== null/u);
assert.ok(
  normalSessionSource.indexOf("session.user.softDeletedAt !== null")
    < normalSessionSource.indexOf("studentProfile.upsert"),
  "normal session must reject soft-deleted legacy users before profile provisioning",
);
const readOnlySessionSource = sessionSource.slice(sessionSource.indexOf("async function getReadOnlySessionContext"));
assert.doesNotMatch(readOnlySessionSource, /lastSeenAt|studentProfile\.upsert|prisma\.user\.update/u);
assert.doesNotMatch(serviceSource, /tx\.user\.create|tx\.roleAssignment\.create|tx\.studentProfile\.|tx\.tutorProfile\.|tx\.authSession\.|tx\.enrollmentHandoff\./u);
assert.match(serviceSource, /sourceFilename/);
assert.match(serviceSource, /contentHash/);

console.log("admin import preview contract checks passed");
