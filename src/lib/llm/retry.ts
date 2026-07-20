// AI Search Phase 5: transport retry moves into the gateway layer (moved
// verbatim from src/lib/embeddings/client.ts, which re-exports it).

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

function isRetryable(e: unknown): boolean {
  const status = (e as { status?: number } | null)?.status;
  return status === 429 || (typeof status === "number" && status >= 500 && status < 600);
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Exponential-backoff retry on 429/5xx only (pure, injectable sleep for tests). */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { maxRetries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> },
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? MAX_RETRIES;
  const baseMs = opts?.baseMs ?? RETRY_BASE_MS;
  const sleep = opts?.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e) || attempt === maxRetries) throw e;
      await sleep(baseMs * 2 ** attempt);
    }
  }
  throw lastErr;
}
