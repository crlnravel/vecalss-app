/**
 * BP-05 rollout state is intentionally a small, environment-backed boundary.
 * It is not a second feature-flag system: the four values below are the
 * operator handoff contract for one coordinated cutover.
 *
 * A process can serve v2 only when the deployment has acknowledged that every
 * banner/media writer uses the BP-01 lock, the old writers are retired, and
 * old in-flight mutations have drained. Missing or malformed acknowledgements
 * always select the legacy safe fallback.
 */
const BANNER_V2_ACTIVATION_ENV = "BANNER_V2_ACTIVATION" as const;
const BANNER_BP01_WRITER_PROTECTION_ACK_ENV = "BANNER_BP01_WRITER_PROTECTION_ACK" as const;
const BANNER_LEGACY_WRITER_RETIREMENT_ACK_ENV = "BANNER_LEGACY_WRITER_RETIREMENT_ACK" as const;
const BANNER_LEGACY_WRITER_DRAIN_ACK_ENV = "BANNER_LEGACY_WRITER_DRAIN_ACK" as const;

type BannerActivationPrerequisites = {
  bp01WriterProtection: boolean;
  legacyWriterDrain: boolean;
  legacyWriterRetirement: boolean;
};

type BannerActivationMode = "active" | "safe-fallback";

type BannerActivationState = {
  editorEnabled: boolean;
  mode: BannerActivationMode;
  prerequisites: BannerActivationPrerequisites;
  requested: boolean;
  readersEnabled: boolean;
  reason: string | null;
};

class LegacyBannerWritesRetiredError extends Error {
  constructor() {
    super("Penulisan banner lama sudah dihentikan. Gunakan editor banner tujuan yang baru.");
    this.name = "LegacyBannerWritesRetiredError";
  }
}

function isAcknowledged(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getBannerActivationState(env: NodeJS.ProcessEnv = process.env): BannerActivationState {
  const prerequisites: BannerActivationPrerequisites = {
    bp01WriterProtection: isAcknowledged(env[BANNER_BP01_WRITER_PROTECTION_ACK_ENV]),
    legacyWriterDrain: isAcknowledged(env[BANNER_LEGACY_WRITER_DRAIN_ACK_ENV]),
    legacyWriterRetirement: isAcknowledged(env[BANNER_LEGACY_WRITER_RETIREMENT_ACK_ENV]),
  };
  const requested = env[BANNER_V2_ACTIVATION_ENV]?.trim().toLowerCase() === "enabled";
  const blockers = [
    !prerequisites.bp01WriterProtection ? "BP-01 writer protection is not acknowledged" : null,
    !prerequisites.legacyWriterRetirement ? "legacy writer retirement is not acknowledged" : null,
    !prerequisites.legacyWriterDrain ? "legacy writer drain is not acknowledged" : null,
  ].filter((value): value is string => Boolean(value));
  const active = requested && blockers.length === 0;

  return {
    editorEnabled: active,
    mode: active ? "active" : "safe-fallback",
    prerequisites,
    requested,
    readersEnabled: active,
    reason: active
      ? null
      : requested
        ? blockers.join("; ")
        : "BANNER_V2_ACTIVATION is not enabled; serving the legacy safe fallback.",
  };
}

function isBannerV2EditorEnabled(env: NodeJS.ProcessEnv = process.env) {
  return getBannerActivationState(env).editorEnabled;
}

function isBannerV2ReaderEnabled(env: NodeJS.ProcessEnv = process.env) {
  return getBannerActivationState(env).readersEnabled;
}

function assertLegacyBannerWritesRetired(): never {
  throw new LegacyBannerWritesRetiredError();
}

export {
  BANNER_BP01_WRITER_PROTECTION_ACK_ENV,
  BANNER_LEGACY_WRITER_DRAIN_ACK_ENV,
  BANNER_LEGACY_WRITER_RETIREMENT_ACK_ENV,
  BANNER_V2_ACTIVATION_ENV,
  LegacyBannerWritesRetiredError,
  assertLegacyBannerWritesRetired,
  getBannerActivationState,
  isBannerV2EditorEnabled,
  isBannerV2ReaderEnabled,
};
export type { BannerActivationMode, BannerActivationPrerequisites, BannerActivationState };
