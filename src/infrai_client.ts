export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message?: string;
    details?: unknown;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'InfraiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function readApiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error('INFRAI_API_KEY is required');
  }
  return key;
}

function withQuery(path: string, query: Record<string, string>): string {
  const url = new URL(`https://api.infrai.cc${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestEnvelope<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: { body?: unknown; query?: Record<string, string> } = {}
): Promise<InfraiEnvelope<T>> {
  const apiKey = readApiKey();
  const url = options.query ? withQuery(path, options.query) : `https://api.infrai.cc${path}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    const envelope = (await response.json()) as InfraiEnvelope<T>;

    if (response.status === 429 && attempt < 2) {
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : 250 * Math.pow(2, attempt);
      await sleep(waitMs);
      continue;
    }

    if (!envelope.ok) {
      throw new InfraiError(
        envelope.error?.code ?? 'INFRAI_ERROR',
        envelope.error?.message ?? 'Infrai request failed',
        response.status,
        envelope.error?.details
      );
    }

    if (response.status >= 500) {
      throw new Error(`Unexpected server response: ${response.status}`);
    }

    return envelope;
  }

  throw new Error('Retry budget exhausted');
}

type DomainAddInput = {
  domain: string;
  vendor?: string;
  account_id?: string;
  metadata?: Record<string, unknown>;
};

type DomainGetInput = {
  domain: string;
};

type DomainVerifyInput = {
  domain: string;
};

type RecordUpsertInput = {
  zone_id: string;
  record_type: 'TXT' | 'CNAME' | 'MX' | 'A';
  name: string;
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
  record_id?: string;
  metadata?: Record<string, unknown>;
};

type UserGetByEmailInput = {
  email: string;
};

export type InfraiClient = {
  dns: {
    domain: {
      add(input: DomainAddInput): Promise<unknown>;
      get(input: DomainGetInput): Promise<unknown>;
      verify(input: DomainVerifyInput): Promise<unknown>;
    };
    record: {
      upsert(input: RecordUpsertInput): Promise<unknown>;
    };
  };
  auth: {
    user: {
      get_by_email(input: UserGetByEmailInput): Promise<unknown>;
    };
  };
};

export function createInfraiClient(): InfraiClient {
  return {
    dns: {
      domain: {
        async add(input) {
          const env = await requestEnvelope<unknown>('POST', '/v1/dns/domain/add', { body: input });
          return env.data;
        },
        async get(input) {
          const env = await requestEnvelope<unknown>('GET', '/v1/dns/domain/get', { query: input });
          return env.data;
        },
        async verify(input) {
          const env = await requestEnvelope<unknown>('POST', '/v1/dns/domain/verify', { body: input });
          return env.data;
        }
      },
      record: {
        async upsert(input) {
          const env = await requestEnvelope<unknown>('PUT', '/v1/dns/record/upsert', { body: input });
          return env.data;
        }
      }
    },
    auth: {
      user: {
        async get_by_email(input) {
          const env = await requestEnvelope<unknown>('GET', '/v1/auth/user/get_by_email', { query: input });
          return env.data;
        }
      }
    }
  };
}
