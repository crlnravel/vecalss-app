import { MAX_REQUEST_BYTES } from "./contracts";

class MultipartRequestError extends Error {
  readonly code: "multipart_invalid" | "request_too_large";

  constructor(
    message = "The multipart request is invalid.",
    code: "multipart_invalid" | "request_too_large" = "multipart_invalid",
  ) {
    super(message);
    this.name = "MultipartRequestError";
    this.code = code;
  }
}

async function readRequestBytesAtMost(request: Request, maxBytes = MAX_REQUEST_BYTES) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0 || parsedLength > maxBytes) {
      return null;
    }
  }

  if (!request.body) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function getMultipartBoundary(contentType: string | null) {
  if (!contentType || !/^multipart\/form-data\s*;/iu.test(contentType)) {
    throw new MultipartRequestError("The request must use multipart/form-data.");
  }

  const match = /(?:^|;)\s*boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/iu.exec(contentType);
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary || boundary.length > 100 || /[\r\n]/u.test(boundary)) {
    throw new MultipartRequestError("The multipart boundary is invalid.");
  }
  return boundary;
}

function parsePartHeaders(value: Uint8Array) {
  const text = new TextDecoder("latin1").decode(value);
  const headers = new Map<string, string>();
  for (const line of text.split("\r\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      throw new MultipartRequestError("The multipart headers are invalid.");
    }
    const name = line.slice(0, separator).trim().toLowerCase();
    const headerValue = line.slice(separator + 1).trim();
    if (!name || headers.has(name)) {
      throw new MultipartRequestError("The multipart headers are invalid.");
    }
    headers.set(name, headerValue);
  }
  return headers;
}

function parseContentDisposition(value: string) {
  if (!/^form-data\s*(?:;|$)/iu.test(value)) {
    throw new MultipartRequestError("The multipart disposition is invalid.");
  }

  const name = /(?:^|;)\s*name="([^"]+)"/iu.exec(value)?.[1]
    ?? /(?:^|;)\s*name=([^;\s]+)/iu.exec(value)?.[1];
  if (!name || name.length > 120 || /[\r\n]/u.test(name)) {
    throw new MultipartRequestError("The multipart field name is invalid.");
  }

  const filename = /(?:^|;)\s*filename="([^"]*)"/iu.exec(value)?.[1]
    ?? /(?:^|;)\s*filename=([^;\s]+)/iu.exec(value)?.[1]
    ?? null;
  return { filename, name };
}

type MultipartStreamPart = {
  contentType: string | null;
  data: AsyncIterable<Uint8Array>;
  filename: string | null;
  name: string;
};

type MultipartStreamHandlers = {
  onField: (part: Omit<MultipartStreamPart, "data"> & { data: Uint8Array }) => Promise<void> | void;
  onFile: (part: MultipartStreamPart) => Promise<void> | void;
};

class AsyncChunkQueue implements AsyncIterable<Uint8Array>, AsyncIterator<Uint8Array> {
  private readonly chunks: Uint8Array[] = [];
  private readonly waiters: Array<{
    reject: (reason?: unknown) => void;
    resolve: (result: IteratorResult<Uint8Array>) => void;
  }> = [];
  private closed = false;
  private failure: unknown = null;

  push(chunk: Uint8Array) {
    if (this.closed || chunk.byteLength === 0) {
      return;
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value: chunk });
      return;
    }
    this.chunks.push(chunk);
  }

  close(error?: unknown) {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.failure = error ?? null;
    while (this.waiters.length) {
      const waiter = this.waiters.shift();
      if (!waiter) {
        break;
      }
      if (this.failure !== null) {
        waiter.reject(this.failure);
      } else {
        waiter.resolve({ done: true, value: undefined });
      }
    }
  }

  next(): Promise<IteratorResult<Uint8Array>> {
    const chunk = this.chunks.shift();
    if (chunk) {
      return Promise.resolve({ done: false, value: chunk });
    }
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    if (this.closed) {
      return Promise.resolve({ done: true, value: undefined });
    }
    return new Promise((resolve, reject) => {
      this.waiters.push({ reject, resolve });
    });
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}

function concatBytes(left: Uint8Array<ArrayBufferLike>, right: Uint8Array<ArrayBufferLike>) {
  if (left.byteLength === 0) {
    return right;
  }
  if (right.byteLength === 0) {
    return left;
  }
  const result = new Uint8Array(left.byteLength + right.byteLength);
  result.set(left, 0);
  result.set(right, left.byteLength);
  return result as Uint8Array<ArrayBufferLike>;
}

function findBytes(haystack: Uint8Array, needle: Uint8Array) {
  if (needle.byteLength === 0) {
    return 0;
  }
  outer: for (let index = 0; index <= haystack.byteLength - needle.byteLength; index += 1) {
    for (let offset = 0; offset < needle.byteLength; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        continue outer;
      }
    }
    return index;
  }
  return -1;
}

function startsWithBytes(value: Uint8Array, prefix: Uint8Array) {
  if (value.byteLength < prefix.byteLength) {
    return false;
  }
  return findBytes(value.subarray(0, prefix.byteLength), prefix) === 0;
}

/**
 * Consume multipart form data without buffering the request or file. File
 * bytes are delivered through an async queue as the boundary scanner reads
 * them; only small multipart headers and text fields are buffered.
 */
async function consumeMultipartRequest(
  request: Request,
  handlers: MultipartStreamHandlers,
  maxBytes = MAX_REQUEST_BYTES,
) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0) {
      throw new MultipartRequestError("The multipart request length is invalid.");
    }
    if (parsedLength > maxBytes) {
      throw new MultipartRequestError("The upload exceeds the request limit.", "request_too_large");
    }
  }

  if (!request.body) {
    throw new MultipartRequestError("The multipart body is missing.");
  }

  const boundary = getMultipartBoundary(request.headers.get("content-type"));
  const opening = new TextEncoder().encode(`--${boundary}`);
  const delimiter = new TextEncoder().encode(`\r\n--${boundary}`);
  const headerTerminator = new Uint8Array([13, 10, 13, 10]);
  const crlf = new Uint8Array([13, 10]);
  const closing = new Uint8Array([45, 45]);
  const maxHeaderBytes = 8_192;
  const maxFieldBytes = 16 * 1024;
  const reader = request.body.getReader();
  let pending: Uint8Array<ArrayBufferLike> = new Uint8Array();
  let totalBytes = 0;
  let state: "opening" | "headers" | "body" | "suffix" | "final" | "finished" = "opening";
  let current: {
    contentType: string | null;
    fieldChunks: Uint8Array[];
    fieldLength: number;
    filename: string | null;
    name: string;
    fileFailure: { error: unknown } | null;
    queue: AsyncChunkQueue | null;
    filePromise: Promise<void> | null;
  } | null = null;

  const consumeBodyBytes = async (bytes: Uint8Array) => {
    if (!current) {
      return;
    }
    if (current.fileFailure?.error) {
      throw current.fileFailure.error;
    }
    if (bytes.byteLength === 0) {
      return;
    }
    if (current.queue) {
      current.queue.push(bytes);
      await Promise.resolve();
      if (current.fileFailure?.error) {
        throw current.fileFailure.error;
      }
      return;
    }
    current.fieldLength += bytes.byteLength;
    if (current.fieldLength > maxFieldBytes) {
      throw new MultipartRequestError("The multipart field is too large.");
    }
    current.fieldChunks.push(bytes);
  };

  const finishCurrent = async () => {
    if (!current) {
      throw new MultipartRequestError("The multipart part is missing.");
    }
    const part = current;
    current = null;
    if (part.queue) {
      part.queue.close();
      await part.filePromise;
      if (part.fileFailure?.error) {
        throw part.fileFailure.error;
      }
      return;
    }

    const fieldData = new Uint8Array(part.fieldLength);
    let offset = 0;
    for (const chunk of part.fieldChunks) {
      fieldData.set(chunk, offset);
      offset += chunk.byteLength;
    }
    await handlers.onField({
      contentType: part.contentType,
      data: fieldData,
      filename: part.filename,
      name: part.name,
    });
  };

  const processPending = async (atEnd: boolean) => {
    while (true) {
      if (state === "finished") {
        if (pending.byteLength > 0) {
          throw new MultipartRequestError("The multipart body has trailing data.");
        }
        return;
      }

      if (state === "final") {
        if (pending.byteLength === 0) {
          if (atEnd) {
            state = "finished";
          }
          return;
        }
        if (pending.byteLength < 2) {
          if (atEnd) {
            throw new MultipartRequestError("The multipart closing boundary is incomplete.");
          }
          return;
        }
        if (!startsWithBytes(pending, crlf)) {
          throw new MultipartRequestError("The multipart body has trailing data.");
        }
        pending = pending.subarray(2);
        if (pending.byteLength > 0) {
          throw new MultipartRequestError("The multipart body has trailing data.");
        }
        state = "finished";
        continue;
      }

      if (state === "opening") {
        if (pending.byteLength < opening.byteLength) {
          if (atEnd) {
            throw new MultipartRequestError("The multipart body has no opening boundary.");
          }
          return;
        }
        if (!startsWithBytes(pending, opening)) {
          throw new MultipartRequestError("The multipart body has no opening boundary.");
        }
        pending = pending.subarray(opening.byteLength);
        state = "suffix";
        continue;
      }

      if (state === "suffix") {
        if (pending.byteLength < 2) {
          if (atEnd) {
            throw new MultipartRequestError("The multipart boundary is incomplete.");
          }
          return;
        }
        if (startsWithBytes(pending, closing)) {
          pending = pending.subarray(2);
          state = "final";
          continue;
        }
        if (startsWithBytes(pending, crlf)) {
          pending = pending.subarray(2);
          state = "headers";
          continue;
        }
        throw new MultipartRequestError("The multipart boundary separator is malformed.");
      }

      if (state === "headers") {
        const headerEnd = findBytes(pending, headerTerminator);
        if (headerEnd < 0) {
          if (pending.byteLength > maxHeaderBytes + headerTerminator.byteLength) {
            throw new MultipartRequestError("The multipart headers are invalid.");
          }
          if (atEnd) {
            throw new MultipartRequestError("The multipart headers are incomplete.");
          }
          return;
        }
        if (headerEnd > maxHeaderBytes) {
          throw new MultipartRequestError("The multipart headers are invalid.");
        }
        const headers = parsePartHeaders(pending.subarray(0, headerEnd));
        const disposition = headers.get("content-disposition");
        if (!disposition) {
          throw new MultipartRequestError("The multipart disposition is missing.");
        }
        const { filename, name } = parseContentDisposition(disposition);
        const queue = filename === null ? null : new AsyncChunkQueue();
        let fileFailure: { error: unknown } | null = null;
        let filePromise: Promise<void> | null = null;
        if (queue !== null) {
          const activeQueue = queue;
          const activeFailure = { error: null as unknown };
          fileFailure = activeFailure;
          filePromise = Promise.resolve()
            .then(() => handlers.onFile({
              contentType: headers.get("content-type") ?? null,
              data: activeQueue,
              filename,
              name,
            }))
            .catch((error: unknown) => {
              activeFailure.error = error;
              activeQueue.close(error);
              void reader.cancel().catch(() => undefined);
            });
        }
        current = {
          contentType: headers.get("content-type") ?? null,
          fieldChunks: [],
          fieldLength: 0,
          fileFailure,
          filename,
          name,
          queue,
          filePromise,
        };
        pending = pending.subarray(headerEnd + headerTerminator.byteLength);
        state = "body";
        continue;
      }

      if (state === "body") {
        const boundaryIndex = findBytes(pending, delimiter);
        if (boundaryIndex < 0) {
          const safeLength = pending.byteLength - (delimiter.byteLength - 1);
          if (safeLength > 0) {
            await consumeBodyBytes(pending.subarray(0, safeLength));
            pending = pending.subarray(safeLength);
          }
          if (atEnd) {
            const activePart = current;
            if (activePart?.queue) {
              const missingBoundary = new MultipartRequestError("The multipart closing boundary is missing.");
              const failureBeforeClose = activePart.fileFailure?.error;
              activePart.queue.close();
              await activePart.filePromise;
              if (failureBeforeClose) {
                throw failureBeforeClose;
              }
              throw missingBoundary;
            }
            throw new MultipartRequestError("The multipart closing boundary is missing.");
          }
          return;
        }

        await consumeBodyBytes(pending.subarray(0, boundaryIndex));
        pending = pending.subarray(boundaryIndex + delimiter.byteLength);
        await finishCurrent();
        state = "suffix";
        continue;
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        await processPending(true);
        if ((state as string) !== "finished") {
          throw new MultipartRequestError("The multipart closing boundary is missing.");
        }
        return;
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new MultipartRequestError("The upload exceeds the request limit.", "request_too_large");
      }
      pending = concatBytes(pending, value);
      await processPending(false);
    }
  } catch (error) {
      const activeQueue = (current as { queue: AsyncChunkQueue | null } | null)?.queue;
      activeQueue?.close(error);
    try {
      await reader.cancel();
    } catch {
      // The original parser/auth error is the bounded public response.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function decodeMultipartField(part: { data: Uint8Array; filename: string | null }) {
  if (part.filename !== null) {
    return null;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(part.data);
  } catch {
    throw new MultipartRequestError("The multipart field is not valid UTF-8.");
  }
}

export {
  MultipartRequestError,
  consumeMultipartRequest,
  decodeMultipartField,
  readRequestBytesAtMost,
};

export type { MultipartStreamPart };
