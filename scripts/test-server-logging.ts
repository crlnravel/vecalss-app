import "server-only";

import assert from "node:assert/strict";

import {
  getServerLogLevel,
  serverLogger,
  type ServerLogLevel,
  type ServerLogContext,
} from "../lib/server-logger";

type CapturedRecord = { level: ServerLogLevel; line: string };
const records: CapturedRecord[] = [];
const originalConsole = {
  debug: console.debug,
  error: console.error,
  info: console.info,
  warn: console.warn,
};
const originalAppLogLevel = process.env.APP_LOG_LEVEL;
const originalNodeEnv = process.env.NODE_ENV;

function setEnvironmentValue(key: string, value: string | undefined) {
  if (value === undefined) Reflect.deleteProperty(process.env, key);
  else Reflect.set(process.env, key, value);
}

function capture(level: ServerLogLevel) {
  return (...values: unknown[]) => {
    records.push({ level, line: String(values[0] ?? "") });
  };
}

function latestRecord() {
  const record = records.at(-1);
  assert.ok(record, "expected a server log record");
  return { ...record, data: JSON.parse(record.line) as Record<string, unknown> };
}

console.debug = capture("debug");
console.info = capture("info");
console.warn = capture("warn");
console.error = capture("error");

try {
  delete process.env.APP_LOG_LEVEL;
  setEnvironmentValue("NODE_ENV", "production");
  assert.equal(getServerLogLevel(), "error");
  setEnvironmentValue("NODE_ENV", "development");
  assert.equal(getServerLogLevel(), "debug");

  process.env.APP_LOG_LEVEL = "verbose";
  assert.equal(getServerLogLevel(), "debug", "unknown levels should use the environment default");

  const thresholdCases: Array<[ServerLogLevel, ServerLogLevel[]]> = [
    ["debug", ["debug", "info", "warn", "error"]],
    ["info", ["info", "warn", "error"]],
    ["warn", ["warn", "error"]],
    ["error", ["error"]],
    ["off", []],
  ];
  for (const [threshold, visibleLevels] of thresholdCases) {
    records.length = 0;
    process.env.APP_LOG_LEVEL = threshold;
    serverLogger.debug("threshold.debug");
    serverLogger.info("threshold.info");
    serverLogger.warn("threshold.warn", { area: "test", operation: "threshold" });
    serverLogger.error("threshold.error", new Error("expected failure"), { area: "test", operation: "threshold" });
    assert.deepEqual(records.map(({ level }) => level), visibleLevels, `${threshold} threshold should filter levels`);
  }

  records.length = 0;
  process.env.APP_LOG_LEVEL = "error";
  const keyConfigurationError = Object.assign(
    new Error("ENROLLMENT_HANDOFF_KEY_RING is required."),
    { code: "missing_key_ring", name: "EnrollmentHandoffCryptoError" },
  );
  serverLogger.error(
    "admin.enrollment.create_kapten.failed",
    keyConfigurationError,
    { area: "admin.enrollment", operation: "create_kapten", code: keyConfigurationError.code },
  );
  const failureRecord = latestRecord();
  assert.equal(failureRecord.data.event, "admin.enrollment.create_kapten.failed");
  assert.equal(failureRecord.data.operation, "create_kapten");
  assert.equal((failureRecord.data.error as Record<string, unknown>).message, "ENROLLMENT_HANDOFF_KEY_RING is required.");
  assert.equal("stack" in (failureRecord.data.error as Record<string, unknown>), false);

  records.length = 0;
  process.env.APP_LOG_LEVEL = "debug";
  const redactionCases: Array<{ message: string; secrets: string[]; marker: string }> = [
    {
      message: "password=multi word secret phrase\ncontinued-secret",
      secrets: ["multi word secret phrase", "continued-secret"],
      marker: "<REDACTED>",
    },
    {
      message: 'passphrase="escaped\\"credential"',
      secrets: ["escaped\\\"credential"],
      marker: "<REDACTED>",
    },
    { message: "studentName=Rani Putri", secrets: ["Rani Putri"], marker: "<REDACTED>" },
    { message: "studentId=student-record-42", secrets: ["student-record-42"], marker: "<REDACTED>" },
    {
      message: "550e8400-e29b-41d4-a716-446655440000",
      secrets: ["550e8400-e29b-41d4-a716-446655440000"],
      marker: "<REDACTED_ID>",
    },
    { message: "api_key=key-secret", secrets: ["key-secret"], marker: "<REDACTED>" },
    { message: "Authorization: Bearer bearer-secret", secrets: ["bearer-secret"], marker: "<REDACTED>" },
    {
      message: "postgresql://db-user:db-password@db.example.test/app?sslmode=verify-full",
      secrets: ["db-user", "db-password", "sslmode=verify-full"],
      marker: "<REDACTED>",
    },
    {
      message: "https://example.test/reset?token=url-secret&email=person@example.test",
      secrets: ["url-secret", "person@example.test"],
      marker: "<REDACTED_QUERY>",
    },
    { message: "email=person@example.test", secrets: ["person@example.test"], marker: "<REDACTED>" },
    { message: "contact person@example.test", secrets: ["person@example.test"], marker: "<REDACTED_EMAIL>" },
    { message: "phone +1 (555) 123-4567", secrets: ["+1 (555) 123-4567"], marker: "<REDACTED_PHONE>" },
  ];
  for (const testCase of redactionCases) {
    records.length = 0;
    serverLogger.error("test.redaction", new Error(testCase.message));
    const line = latestRecord().line;
    for (const secret of testCase.secrets) {
      assert.equal(line.includes(secret), false, `log output must redact ${secret}`);
    }
    assert.ok(line.includes(testCase.marker), `log output should use ${testCase.marker}`);
  }

  const rootCause = new Error("cause access_token=child-secret and contact person@example.test");
  Object.defineProperty(rootCause, "cause", {
    value: {
      meta: {
        cause: {
          code: "driver_constraint",
          kind: "DriverError",
          constraint: { index: "nested_driver_idx", fields: ["questionId"] },
        },
      },
    },
  });
  const unsafeError = new Error("Database constraint failed");
  Object.assign(unsafeError, {
    code: "P2002",
    constraint: { index: "question_bank_unique", fields: ["questionId", "person@example.test"] },
  });
  Object.defineProperty(unsafeError, "cause", { value: rootCause });
  serverLogger.error(
    "test.action.failed",
    unsafeError,
    {
      area: "test",
      operation: "redaction",
      payload: { password: "object-secret" },
    } as unknown as ServerLogContext,
  );
  const redactedLine = latestRecord().line;
  for (const value of [
    "child-secret",
    "person@example.test",
    "object-secret",
  ]) {
    assert.equal(redactedLine.includes(value), false, `log output must redact ${value}`);
  }
  assert.match(redactedLine, /<REDACTED>/);
  assert.match(redactedLine, /"code":"P2002"/);
  assert.match(redactedLine, /"constraintIndex":"question_bank_unique"/);
  assert.match(redactedLine, /"constraintFields":\["questionId","<REDACTED_EMAIL>"\]/);
  assert.match(redactedLine, /"cause"/);
  assert.match(redactedLine, /"constraintIndex":"nested_driver_idx"/);
  assert.match(redactedLine, /"code":"driver_constraint"/);
  assert.match(redactedLine, /"stack"/);

  records.length = 0;
  serverLogger.error("unknown.throwable", { password: "object-secret" }, { area: "test" });
  assert.equal(latestRecord().line.includes("object-secret"), false);

  const unreadableError = new Error("summary must not break action handling");
  Object.defineProperty(unreadableError, "code", {
    get() {
      throw new Error("getter failure");
    },
  });
  serverLogger.error("unreadable.throwable", unreadableError);
  assert.equal((latestRecord().data.error as Record<string, unknown>).name, "ErrorSummaryUnavailable");
} finally {
  console.debug = originalConsole.debug;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  if (originalAppLogLevel === undefined) delete process.env.APP_LOG_LEVEL;
  else process.env.APP_LOG_LEVEL = originalAppLogLevel;
  setEnvironmentValue("NODE_ENV", originalNodeEnv);
}

console.log("server logging checks passed");
