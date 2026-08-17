/** Shared provider runtime: throttling, retry with backoff, concurrency limits. */

export class ProviderNotConfiguredError extends Error {
  code = "PROVIDER_NOT_CONFIGURED" as const;
  constructor(providerName: string, hint?: string) {
    super(
      `${providerName} is not configured.${hint ? ` ${hint}` : ""}`,
    );
  }
}

export class ProviderUnavailableError extends Error {
  code = "PROVIDER_UNAVAILABLE" as const;
}

export const RATE_LIMITS = {
  /** Max items handled per job batch call. */
  batchSize: 10,
  /** Max parallel outbound requests inside a batch. */
  maxConcurrency: 4,
  /** Delay between retries (ms), grows exponentially. */
  baseBackoffMs: 400,
  maxAttempts: 3,
  /** Minimum spacing between outbound calls to the same provider. */
  minSpacingMs: 120,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry with exponential backoff. Never retries "not configured" failures. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = RATE_LIMITS.maxAttempts): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ProviderNotConfiguredError) throw error;
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(RATE_LIMITS.baseBackoffMs * Math.pow(2, attempt));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new ProviderUnavailableError("Provider request failed");
}

/** Runs tasks with a bounded concurrency and a small spacing between starts. */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await sleep(RATE_LIMITS.minSpacingMs);
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
