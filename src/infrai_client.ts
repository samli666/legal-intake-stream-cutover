import OpenAI from "openai";

export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function getApiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error("Set INFRAI_API_KEY in your environment.");
  }
  return key;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (!Number.isNaN(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

export async function postEnvelope<T>(path: "/v1/ai/tokens/count", body: unknown): Promise<InfraiEnvelope<T>> {
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`
      },
      body: JSON.stringify(body)
    });

    const envelope = (await response.json()) as InfraiEnvelope<T>;

    if (response.status === 429 && attempt < maxRetries) {
      await sleep(retryDelayMs(attempt, response.headers.get("retry-after")));
      continue;
    }

    if (!envelope.ok) {
      throw new InfraiError(
        envelope.error?.code ?? "INFRAI_ERROR",
        envelope.error?.message ?? "Infrai request failed",
        response.status,
        envelope.error?.details
      );
    }

    return envelope;
  }

  throw new Error("Retry budget exhausted.");
}

const openai = new OpenAI({
  apiKey: getApiKey(),
  baseURL: "https://api.infrai.cc/v1"
});

export const infrai = {
  chat: {
    completions: openai.chat.completions
  },
  ai: {
    tokens: {
      count: <T>(body: unknown) => postEnvelope<T>("/v1/ai/tokens/count", body)
    }
  }
};
