import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { observe } from '../telemetry';
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export function signature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body = '',
) {
  return createHmac('sha256', secret)
    .update(timestamp + method + path + body)
    .digest('base64');
}
export class BinanceClient {
  constructor(
    private credentials = {
      key: process.env.BINANCE_WEB3_API_KEY,
      secret: process.env.BINANCE_WEB3_API_SECRET,
    },
    private transport: typeof fetch = fetch,
    private correlationId: string = randomUUID(),
  ) {}
  async call<T>(
    module: string,
    path: string,
    schema: z.ZodType<T>,
    params: Record<string, string> = {},
    payload?: unknown,
  ): Promise<T> {
    if (!this.credentials.key || !this.credentials.secret)
      throw new ApiError(
        'MISSING_CREDENTIALS',
        'Configure BINANCE_WEB3_API_KEY and BINANCE_WEB3_API_SECRET in .env.local.',
        503,
      );
    const query = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const signedPath = '/build' + path + (query ? '?' + query : '');
    const method = payload === undefined ? 'GET' : 'POST';
    const body = payload === undefined ? '' : JSON.stringify(payload);
    for (let attempt = 1; attempt <= 3; attempt++) {
      const began = performance.now(),
        timestamp = new Date().toISOString();
      let status: number | undefined;
      let retryAfter = 0;
      try {
        const response = await this.transport('https://web3.binance.com' + signedPath, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'X-OC-APIKEY': this.credentials.key,
            'X-OC-TIMESTAMP': timestamp,
            'X-OC-NONCE': randomUUID(),
            'X-OC-SIGN': signature(this.credentials.secret, timestamp, method, signedPath, body),
          },
          body: body || undefined,
          signal: AbortSignal.timeout(10000),
          redirect: 'error',
          cache: 'no-store',
        });
        status = response.status;
        const retryHeader = response.headers.get('retry-after');
        if (retryHeader) {
          const seconds = Number(retryHeader);
          retryAfter = Number.isFinite(seconds)
            ? seconds * 1000
            : Math.max(0, Date.parse(retryHeader) - Date.now());
        }
        if (!response.ok)
          throw new ApiError(
            `HTTP_${status}`,
            status === 401
              ? 'Binance rejected the API credentials or signature.'
              : status === 429
                ? 'Binance rate limit reached. Please retry shortly.'
                : `Binance ${module} unavailable (HTTP ${status}).`,
            status,
          );
        const envelope = z
          .object({ code: z.number(), data: z.unknown(), success: z.boolean().optional() })
          .safeParse(await response.json());
        if (!envelope.success)
          throw new ApiError(
            'MALFORMED_RESPONSE',
            `Binance ${module} returned an invalid envelope.`,
          );
        if (envelope.data.code !== 0 || envelope.data.success === false)
          throw new ApiError(
            String(envelope.data.code),
            `Binance ${module} rejected the request (code ${envelope.data.code}).`,
          );
        const parsed = schema.safeParse(envelope.data.data);
        if (!parsed.success)
          throw new ApiError(
            'MALFORMED_RESPONSE',
            `Binance ${module} response did not match its documented schema.`,
          );
        observe({
          id: randomUUID(),
          correlationId: this.correlationId,
          module,
          operation: path,
          startedAt: timestamp,
          durationMs: Math.round(performance.now() - began),
          httpStatus: status,
          success: true,
          attempt,
        });
        return parsed.data;
      } catch (e) {
        const error =
          e instanceof ApiError
            ? e
            : new ApiError(
                e instanceof Error && e.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR',
                `Binance ${module} could not be reached.`,
              );
        observe({
          id: randomUUID(),
          correlationId: this.correlationId,
          module,
          operation: path,
          startedAt: timestamp,
          durationMs: Math.round(performance.now() - began),
          httpStatus: status,
          success: false,
          errorCode: error.code,
          attempt,
        });
        // Only reads / simulation can retry. This client never broadcasts or submits signed orders.
        if (
          attempt === 3 ||
          !['HTTP_429', 'HTTP_500', 'HTTP_502', 'HTTP_503', 'TIMEOUT', 'NETWORK_ERROR'].includes(
            error.code,
          )
        )
          throw error;
        if (retryAfter > 10000) throw error;
        await new Promise((r) => setTimeout(r, Math.max(retryAfter, attempt * 500)));
      }
    }
    throw new ApiError('RETRY_EXHAUSTED', 'Request retry budget exhausted');
  }
}
