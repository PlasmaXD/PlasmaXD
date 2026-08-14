import "server-only";

import { randomUUID } from "node:crypto";

import { processDocument } from "./ocr";
import type { Job, JobDocument } from "./types";

/**
 * In-memory job store.
 *
 * This is the MVP's deliberate shortcut: it keeps the app runnable with nothing
 * but an API key — no database, no queue, no object storage. It does not survive
 * a restart and does not work across multiple server instances, so it is the
 * first thing to replace (Postgres + a real queue) before this leaves a laptop.
 */

type StoredFile = { mimeType: string; bytes: Uint8Array };

type StoredJob = Job & { files: Map<string, StoredFile> };

const jobs = new Map<string, StoredJob>();

/** Jobs are evicted after this long to stop the process growing without bound. */
const JOB_TTL_MS = 60 * 60 * 1000;

/** How many documents are sent to the API at once. */
const CONCURRENCY = 3;

function evictExpired(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

export type UploadInput = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

export function createJob(uploads: readonly UploadInput[]): Job {
  evictExpired();

  const files = new Map<string, StoredFile>();
  const documents: JobDocument[] = uploads.map((upload) => {
    const id = randomUUID();
    files.set(id, { mimeType: upload.mimeType, bytes: upload.bytes });
    return { id, fileName: upload.fileName, status: "queued" };
  });

  const job: StoredJob = {
    id: randomUUID(),
    status: "queued",
    createdAt: Date.now(),
    documents,
    files,
  };
  jobs.set(job.id, job);

  // Kick off processing without blocking the upload response. Failures are
  // recorded on the job itself, so nothing here can reject.
  void run(job, uploads);

  return toView(job);
}

async function run(job: StoredJob, uploads: readonly UploadInput[]) {
  job.status = "running";

  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, uploads.length) },
    async () => {
      while (cursor < uploads.length) {
        const index = cursor++;
        const upload = uploads[index];
        const doc = job.documents[index];
        doc.status = "running";
        try {
          doc.result = await withRetry(() =>
            processDocument(
              doc.id,
              upload.fileName,
              upload.mimeType,
              upload.bytes,
            ),
          );
          doc.status = "done";
        } catch (error) {
          doc.status = "error";
          doc.error = error instanceof Error ? error.message : String(error);
        }
      }
    },
  );

  await Promise.all(workers);
  job.status = job.documents.every((d) => d.status === "error")
    ? "error"
    : "done";
}

/** Retries on rate limits and transient server errors with exponential backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
    }
  }
  throw lastError;
}

function isRetryable(error: unknown): boolean {
  const status = (error as { statusCode?: number; status?: number } | null)
    ?.statusCode;
  return status === 429 || (typeof status === "number" && status >= 500);
}

export function getJob(id: string): Job | undefined {
  const job = jobs.get(id);
  return job ? toView(job) : undefined;
}

export function getFile(
  jobId: string,
  documentId: string,
): StoredFile | undefined {
  return jobs.get(jobId)?.files.get(documentId);
}

/** Strips the stored bytes so job state can be serialised to the client. */
function toView(job: StoredJob): Job {
  const { files: _files, ...view } = job;
  return structuredClone(view);
}
