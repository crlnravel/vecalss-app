"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import {
  canonicalizeResourceKey,
  isLeaseInstanceToken,
  isPositiveGeneration,
} from "@/lib/resource-edit-lock/canonical";
import {
  EDIT_LEASE_HEARTBEAT_MS,
  EDIT_LEASE_SAFETY_MARGIN_MS,
  type EditLeaseProof,
  type EditLeaseResourceType,
  type EditLeaseServerStatus,
  type EditLeaseState,
} from "@/lib/resource-edit-lock/types";

const TAB_NONCE_STORAGE_KEY = "vecalss:resource-edit-lock:tab-nonce:v1";
const TAB_CHANNEL_NAME = "vecalss:resource-edit-lock:tabs:v1";
const PROOF_STORAGE_PREFIX = "vecalss:resource-edit-lock:proof:v1:";
const HANDSHAKE_WAIT_MS = 75;
const LOCK_RECHECK_POLL_MS = 1_000;

type ProviderProps = PropsWithChildren<{
  enabled?: boolean;
  resourceId: string;
  resourceType: EditLeaseResourceType;
}>;

type ResourceEditLockContextValue = {
  canEdit: boolean;
  generation: number | null;
  holderEmail: string | null;
  holderName: string | null;
  holderUserId: string | null;
  lastError: string | null;
  proof: EditLeaseProof | null;
  remainingMs: number;
  release: () => Promise<void>;
  retry: () => void;
  serverNow: string | null;
  state: EditLeaseState;
};

type LeaseCommandError = Error & {
  code?: string;
  details?: unknown;
  status?: number;
};

type BroadcastMessage =
  | { source: string; type: "challenge"; nonce: string }
  | { nonce: string; source: string; type: "presence" };

const ResourceEditLockContext = createContext<ResourceEditLockContextValue | null>(null);

function randomBase64Url(bytes: number) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  let binary = "";
  for (const value of values) binary += String.fromCharCode(value);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

function getStableTabNonce() {
  try {
    const existing = window.sessionStorage.getItem(TAB_NONCE_STORAGE_KEY);
    if (existing && /^[A-Za-z0-9_-]{22}$/u.test(existing)) return existing;
    const next = randomBase64Url(16);
    window.sessionStorage.setItem(TAB_NONCE_STORAGE_KEY, next);
    return next;
  } catch {
    return randomBase64Url(16);
  }
}

function proofStorageKey(resourceKey: string) {
  return `${PROOF_STORAGE_PREFIX}${encodeURIComponent(resourceKey)}`;
}

function loadStoredProof(resourceKey: string): EditLeaseProof | null {
  try {
    const raw = window.sessionStorage.getItem(proofStorageKey(resourceKey));
    if (!raw) return null;
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!isLeaseInstanceToken(value.token) || !isPositiveGeneration(value.generation)) return null;
    return { generation: value.generation, token: value.token };
  } catch {
    return null;
  }
}

function storeProof(resourceKey: string, proof: EditLeaseProof | null) {
  try {
    if (proof) {
      window.sessionStorage.setItem(proofStorageKey(resourceKey), JSON.stringify(proof));
    } else {
      window.sessionStorage.removeItem(proofStorageKey(resourceKey));
    }
  } catch {
    // Storage is an optimization for reload rotation; the in-memory proof is authoritative.
  }
}

function parseCommandError(response: Response, body: unknown): LeaseCommandError {
  const code = body && typeof body === "object" && !Array.isArray(body)
    && typeof (body as { error?: unknown }).error === "string"
    ? (body as { error: string }).error
    : `http_${response.status}`;
  const error = new Error(code) as LeaseCommandError;
  error.code = code;
  error.details = body;
  error.status = response.status;
  return error;
}

async function command<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/mentor/resource-edit-lock/${path}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json; charset=utf-8" },
    keepalive: path === "release",
    method: "POST",
  });
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // The stable error below intentionally contains no response body or proof.
  }
  if (!response.ok) throw parseCommandError(response, parsed);
  return parsed as T;
}

function isOwnedStatus(value: unknown): value is EditLeaseServerStatus & { generation: number } {
  return Boolean(value)
    && typeof value === "object"
    && (value as EditLeaseServerStatus).state === "owned"
    && isPositiveGeneration((value as EditLeaseServerStatus).generation)
    && Number.isFinite((value as EditLeaseServerStatus).remainingMs)
    && typeof (value as EditLeaseServerStatus).serverNow === "string";
}

function isLockedStatus(value: unknown): value is EditLeaseServerStatus {
  return Boolean(value)
    && typeof value === "object"
    && (value as EditLeaseServerStatus).state === "locked"
    && Number.isFinite((value as EditLeaseServerStatus).remainingMs)
    && typeof (value as EditLeaseServerStatus).serverNow === "string";
}

function deadlineFromStatus(status: EditLeaseServerStatus) {
  return performance.now() + Math.max(0, status.remainingMs) - EDIT_LEASE_SAFETY_MARGIN_MS;
}

function useResourceEditLockContext(): ResourceEditLockContextValue {
  const context = useContext(ResourceEditLockContext);
  if (!context) {
    throw new Error("useResourceEditLock must be used inside ResourceEditLockProvider.");
  }
  return context;
}

function ResourceEditLockProvider({
  children,
  enabled = true,
  resourceId,
  resourceType,
}: ProviderProps) {
  const canonicalResource = useMemo(() => {
    try {
      return canonicalizeResourceKey(resourceType, resourceId);
    } catch {
      return null;
    }
  }, [resourceId, resourceType]);
  const resourceKey = canonicalResource?.resourceKey ?? null;
  const [state, setState] = useState<EditLeaseState>(enabled && resourceKey ? "acquiring" : "lost");
  const [proof, setProof] = useState<EditLeaseProof | null>(null);
  const [holderEmail, setHolderEmail] = useState<string | null>(null);
  const [holderName, setHolderName] = useState<string | null>(null);
  const [holderUserId, setHolderUserId] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [serverNow, setServerNow] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const proofRef = useRef<EditLeaseProof | null>(null);
  const stateRef = useRef(state);
  const deadlineRef = useRef(0);
  const commandSerialRef = useRef(0);
  const lockRecheckInFlightRef = useRef(false);
  const retryAfterLockRecheckRef = useRef(false);
  const lifecycleAtRef = useRef(0);
  const mountedRef = useRef(false);
  const tabNonceRef = useRef<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const updateState = useCallback((next: EditLeaseState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const setOwned = useCallback((nextProof: EditLeaseProof, status: EditLeaseServerStatus) => {
    if (!isOwnedStatus(status)) {
      updateState("lost");
      return;
    }
    proofRef.current = nextProof;
    setProof(nextProof);
    storeProof(resourceKey ?? "", nextProof);
    setHolderEmail(null);
    setHolderName(null);
    setHolderUserId(null);
    setLastError(null);
    setServerNow(status.serverNow);
    setRemainingMs(status.remainingMs);
    deadlineRef.current = deadlineFromStatus(status);
    updateState("owned");
  }, [resourceKey, updateState]);

  const setLocked = useCallback((status: EditLeaseServerStatus) => {
    proofRef.current = null;
    setProof(null);
    storeProof(resourceKey ?? "", null);
    setHolderEmail(status.holderEmail ?? null);
    setHolderName(status.holderName ?? null);
    setHolderUserId(status.holderUserId ?? null);
    setServerNow(status.serverNow);
    setRemainingMs(status.remainingMs);
    deadlineRef.current = 0;
    updateState("locked");
  }, [resourceKey, updateState]);

  const markLost = useCallback((errorCode: string | null = null) => {
    proofRef.current = null;
    setProof(null);
    storeProof(resourceKey ?? "", null);
    setHolderEmail(null);
    setHolderName(null);
    setHolderUserId(null);
    setRemainingMs(0);
    deadlineRef.current = 0;
    setLastError(errorCode);
    updateState("lost");
  }, [resourceKey, updateState]);

  const acquire = useCallback(async (previous: EditLeaseProof | null, serial: number) => {
    if (!resourceKey || !mountedRef.current || serial !== commandSerialRef.current) return;
    const nextToken = randomBase64Url(32);
    try {
      const result = previous
        ? await command<EditLeaseServerStatus>("rotate", {
          newToken: nextToken,
          previousGeneration: previous.generation,
          previousToken: previous.token,
          resourceId: canonicalResource?.resourceId,
          resourceType,
        })
        : await command<EditLeaseServerStatus>("acquire", {
          newToken: nextToken,
          resourceId: canonicalResource?.resourceId,
          resourceType,
        });
      if (!mountedRef.current || serial !== commandSerialRef.current) return;
      if (isOwnedStatus(result)) {
        setOwned({ generation: result.generation, token: nextToken }, result);
      } else if (isLockedStatus(result)) {
        setLocked(result);
      } else {
        markLost("invalid_response");
      }
    } catch (error) {
      if (!mountedRef.current || serial !== commandSerialRef.current) return;
      const code = (error as LeaseCommandError).code ?? "resource_busy_retry";
      if (previous && (code === "lease_expired" || code === "lease_superseded")) {
        try {
          const fallback = await command<EditLeaseServerStatus>("acquire", {
            newToken: nextToken,
            resourceId: canonicalResource?.resourceId,
            resourceType,
          });
          if (!mountedRef.current || serial !== commandSerialRef.current) return;
          if (isOwnedStatus(fallback)) {
            setOwned({ generation: fallback.generation, token: nextToken }, fallback);
          } else if (isLockedStatus(fallback)) {
            setLocked(fallback);
          } else {
            markLost("invalid_response");
          }
          return;
        } catch (fallbackError) {
          markLost((fallbackError as LeaseCommandError).code ?? "resource_busy_retry");
          return;
        }
      }
      if (code === "resource_locked" && isLockedStatus((error as LeaseCommandError).details)) {
        setLocked((error as LeaseCommandError).details as EditLeaseServerStatus);
        return;
      }
      markLost(code);
    }
  }, [canonicalResource, markLost, resourceKey, resourceType, setLocked, setOwned]);

  const beginAcquire = useCallback((previous: EditLeaseProof | null = null) => {
    if (lockRecheckInFlightRef.current) {
      retryAfterLockRecheckRef.current = true;
      return;
    }
    commandSerialRef.current += 1;
    const serial = commandSerialRef.current;
    setHolderEmail(null);
    setHolderName(null);
    setHolderUserId(null);
    setLastError(null);
    setRemainingMs(0);
    updateState("acquiring");
    void acquire(previous, serial);
  }, [acquire, updateState]);

  const recover = useCallback(() => {
    if (!resourceKey || !mountedRef.current) return;
    const previous = proofRef.current;
    if (!previous) {
      beginAcquire();
      return;
    }
    commandSerialRef.current += 1;
    const serial = commandSerialRef.current;
    const nextToken = randomBase64Url(32);
    updateState("uncertain");
    void (async () => {
      try {
        const result = await command<EditLeaseServerStatus>("rotate", {
          newToken: nextToken,
          previousGeneration: previous.generation,
          previousToken: previous.token,
          resourceId: canonicalResource?.resourceId,
          resourceType,
        });
        if (!mountedRef.current || serial !== commandSerialRef.current) return;
        if (isOwnedStatus(result)) setOwned({ generation: result.generation, token: nextToken }, result);
        else if (isLockedStatus(result)) setLocked(result);
        else markLost("invalid_response");
      } catch (error) {
        if (!mountedRef.current || serial !== commandSerialRef.current) return;
        const code = (error as LeaseCommandError).code ?? "resource_busy_retry";
        if (code === "lease_expired" || code === "lease_superseded") {
          beginAcquire();
        } else {
          markLost(code);
        }
      }
    })();
  }, [beginAcquire, canonicalResource, markLost, resourceKey, resourceType, setLocked, setOwned, updateState]);

  const renewCurrent = useCallback(() => {
    const current = proofRef.current;
    if (!current || !resourceKey || !canonicalResource || !mountedRef.current) {
      recover();
      return;
    }
    commandSerialRef.current += 1;
    const serial = commandSerialRef.current;
    updateState("uncertain");
    void command<EditLeaseServerStatus>("renew", {
      generation: current.generation,
      resourceId: canonicalResource.resourceId,
      resourceType,
      token: current.token,
    }).then((result) => {
      if (!mountedRef.current || serial !== commandSerialRef.current || proofRef.current?.token !== current.token) return;
      if (isOwnedStatus(result) && performance.now() < deadlineRef.current) setOwned(current, result);
      else markLost("lease_expired");
    }).catch((error: LeaseCommandError) => {
      if (serial !== commandSerialRef.current) return;
      markLost(error.code ?? "resource_busy_retry");
    });
  }, [canonicalResource, markLost, recover, resourceKey, resourceType, setOwned, updateState]);

  const release = useCallback(async () => {
    const current = proofRef.current;
    if (!current || !canonicalResource || !mountedRef.current) return;
    commandSerialRef.current += 1;
    const serial = commandSerialRef.current;
    try {
      await command("release", {
        generation: current.generation,
        resourceId: canonicalResource.resourceId,
        resourceType,
        token: current.token,
      });
    } catch {
      // Release is idempotent server-side; a lost network cannot make this tab editable.
    } finally {
      if (serial === commandSerialRef.current) markLost(null);
    }
  }, [canonicalResource, markLost, resourceType]);

  useEffect(() => {
    mountedRef.current = true;
    lifecycleAtRef.current = performance.now();
    if (!enabled || !canonicalResource) {
      const invalidResourceTimer = setTimeout(() => markLost("invalid_proof"), 0);
      return () => {
        mountedRef.current = false;
        clearTimeout(invalidResourceTimer);
      };
    }

    const source = randomBase64Url(12);
    const tabNonce = getStableTabNonce();
    tabNonceRef.current = tabNonce;
    let duplicateDetected = false;
    let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: BroadcastChannel | null = null;

    try {
      channel = new BroadcastChannel(TAB_CHANNEL_NAME);
      channelRef.current = channel;
      channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
        const message = event.data;
        if (!message || message.source === source) return;
        if (message.type === "challenge" && message.nonce === tabNonce) {
          channel?.postMessage({ nonce: tabNonce, source, type: "presence" } satisfies BroadcastMessage);
        } else if (message.type === "presence" && message.nonce === tabNonce) {
          duplicateDetected = true;
          const replacement = randomBase64Url(16);
          tabNonceRef.current = replacement;
          try {
            window.sessionStorage.setItem(TAB_NONCE_STORAGE_KEY, replacement);
          } catch {
            // A memory-only nonce still prevents this provider instance from reusing the clone's nonce.
          }
        }
      };
      channel.postMessage({ nonce: tabNonce, source, type: "challenge" } satisfies BroadcastMessage);
    } catch {
      channel = null;
      channelRef.current = null;
    }

    handshakeTimer = setTimeout(() => {
      const previous = duplicateDetected ? null : loadStoredProof(canonicalResource.resourceKey);
      beginAcquire(previous);
    }, HANDSHAKE_WAIT_MS);

    const onLifecycle = () => {
      if (document.visibilityState === "hidden") return;
      const elapsed = performance.now() - lifecycleAtRef.current;
      lifecycleAtRef.current = performance.now();
      const currentState = stateRef.current;
      // A refresh can fire both events during the startup handshake; don't race its pending acquire or recovery.
      if (
        currentState === "locked"
        || currentState === "acquiring"
        || currentState === "uncertain"
      ) {
        return;
      }
      if (currentState !== "owned" || elapsed >= EDIT_LEASE_HEARTBEAT_MS) recover();
      else renewCurrent();
    };
    const onPageHide = () => {
      const current = proofRef.current;
      if (!current) return;
      void fetch("/api/mentor/resource-edit-lock/release", {
        body: JSON.stringify({
          generation: current.generation,
          resourceId: canonicalResource.resourceId,
          resourceType,
          token: current.token,
        }),
        headers: { "Content-Type": "application/json; charset=utf-8" },
        keepalive: true,
        method: "POST",
      }).catch(() => undefined);
    };

    document.addEventListener("visibilitychange", onLifecycle);
    window.addEventListener("focus", onLifecycle);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      mountedRef.current = false;
      if (handshakeTimer) clearTimeout(handshakeTimer);
      document.removeEventListener("visibilitychange", onLifecycle);
      window.removeEventListener("focus", onLifecycle);
      window.removeEventListener("pagehide", onPageHide);
      channel?.close();
      channelRef.current = null;
      const current = proofRef.current;
      if (current) {
        void fetch("/api/mentor/resource-edit-lock/release", {
          body: JSON.stringify({
            generation: current.generation,
            resourceId: canonicalResource.resourceId,
            resourceType,
            token: current.token,
          }),
          headers: { "Content-Type": "application/json; charset=utf-8" },
          keepalive: true,
          method: "POST",
        }).catch(() => undefined);
      }
      proofRef.current = null;
      setProof(null);
    };
  }, [beginAcquire, canonicalResource, enabled, markLost, recover, renewCurrent, resourceType]);

  useEffect(() => {
    if (state !== "owned" || !proof || !canonicalResource || !enabled) return;
    let expiredTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const scheduleExpiry = () => {
      if (expiredTimer) clearTimeout(expiredTimer);
      const wait = Math.max(0, deadlineRef.current - performance.now());
      expiredTimer = setTimeout(() => {
        if (performance.now() >= deadlineRef.current) markLost("lease_expired");
        else scheduleExpiry();
      }, wait);
    };
    const heartbeat = () => {
      const current = proofRef.current;
      if (!current || stateRef.current !== "owned") return;
      const serial = commandSerialRef.current;
      void command<EditLeaseServerStatus>("renew", {
        generation: current.generation,
        resourceId: canonicalResource.resourceId,
        resourceType,
        token: current.token,
      }).then((result) => {
        if (!mountedRef.current || serial !== commandSerialRef.current || proofRef.current?.token !== current.token) return;
        if (isOwnedStatus(result) && performance.now() < deadlineRef.current) {
          setOwned(current, result);
          scheduleExpiry();
        } else {
          markLost("lease_expired");
        }
      }).catch((error: LeaseCommandError) => {
        if (serial !== commandSerialRef.current) return;
        markLost(error.code ?? "resource_busy_retry");
      });
    };

    scheduleExpiry();
    heartbeatTimer = setInterval(heartbeat, EDIT_LEASE_HEARTBEAT_MS);
    return () => {
      if (expiredTimer) clearTimeout(expiredTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    };
  }, [canonicalResource, enabled, markLost, proof, resourceType, setOwned, state]);

  useEffect(() => {
    if (state !== "locked" || !canonicalResource || !enabled) return;
    let active = true;

    const recheck = () => {
      if (
        !active
        || !mountedRef.current
        || stateRef.current !== "locked"
        || document.visibilityState === "hidden"
        || lockRecheckInFlightRef.current
      ) {
        return;
      }

      lockRecheckInFlightRef.current = true;
      const serial = commandSerialRef.current;
      const token = randomBase64Url(32);

      void command<EditLeaseServerStatus>("acquire", {
        newToken: token,
        resourceId: canonicalResource.resourceId,
        resourceType,
      }).then((result) => {
        if (
          !active
          || !mountedRef.current
          || serial !== commandSerialRef.current
          || stateRef.current !== "locked"
        ) {
          return;
        }

        setLastError(null);
        if (isOwnedStatus(result)) {
          setOwned({ generation: result.generation, token }, result);
        } else if (isLockedStatus(result)) {
          setLocked(result);
        } else {
          markLost("invalid_response");
        }
      }).catch((error: LeaseCommandError) => {
        if (
          !active
          || !mountedRef.current
          || serial !== commandSerialRef.current
          || stateRef.current !== "locked"
        ) {
          return;
        }

        const code = error.code ?? "resource_busy_retry";
        if (code === "resource_locked" && isLockedStatus(error.details)) {
          setLastError(null);
          setLocked(error.details);
          return;
        }

        if (
          code === "forbidden_origin"
          || code === "invalid_proof"
          || code === "json_media_type_required"
          || code === "resource_inaccessible"
          || code === "unauthenticated"
        ) {
          markLost(code);
        } else {
          // Keep editing disabled and retry transient failures on the next poll.
          setLastError(code);
        }
      }).finally(() => {
        lockRecheckInFlightRef.current = false;
        if (!active) return;

        if (retryAfterLockRecheckRef.current) {
          retryAfterLockRecheckRef.current = false;
          if (stateRef.current === "locked") beginAcquire();
        }
      });
    };

    recheck();
    const pollTimer = setInterval(recheck, LOCK_RECHECK_POLL_MS);
    return () => {
      active = false;
      clearInterval(pollTimer);
      retryAfterLockRecheckRef.current = false;
    };
  }, [beginAcquire, canonicalResource, enabled, markLost, resourceType, setLocked, setOwned, state]);

  const retry = useCallback(() => beginAcquire(), [beginAcquire]);
  const context = useMemo<ResourceEditLockContextValue>(() => ({
    canEdit: state === "owned" && proof !== null && remainingMs > EDIT_LEASE_SAFETY_MARGIN_MS,
    generation: proof?.generation ?? null,
    holderEmail,
    holderName,
    holderUserId,
    lastError,
    proof,
    release,
    remainingMs,
    retry,
    serverNow,
    state,
  }), [holderEmail, holderName, holderUserId, lastError, proof, release, remainingMs, retry, serverNow, state]);

  return <ResourceEditLockContext.Provider value={context}>{children}</ResourceEditLockContext.Provider>;
}

const EditLeaseProvider = ResourceEditLockProvider;
const useResourceEditLock = useResourceEditLockContext;
const useEditLease = useResourceEditLockContext;

export {
  EditLeaseProvider,
  ResourceEditLockProvider,
  useEditLease,
  useResourceEditLock,
};
export type { ProviderProps as ResourceEditLockProviderProps, ResourceEditLockContextValue };
