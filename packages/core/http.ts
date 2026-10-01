const SECRET_NAMES = ['BINANCE_WEB3_API_KEY', 'BINANCE_WEB3_API_SECRET', 'ALPACA_API_KEY_ID', 'ALPACA_API_SECRET_KEY', 'DATABASE_URL', 'ATLAS_AGENT_TOKEN', 'ATLAS_REFERENCE_TOKEN'];
export function safeMessage(error: unknown, fallback = 'Service unavailable. Check server configuration and retry.') {
  if (!(error instanceof Error)) return fallback;
  if (/postgres|password|sql|connection string/i.test(error.message)) return fallback;
  let message = error.message;
  for (const key of SECRET_NAMES) if (process.env[key]) message = message.split(process.env[key]!).join('[redacted]');
  return message.replace(/(https?:\/\/)[^/\s@]+:[^/\s@]+@/gi, '$1[redacted]@');
}
export async function boundedJson(request: Request, maxBytes = 12000): Promise<unknown> {
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) throw new Error('BODY_TOO_LARGE: Request exceeds 12 KB.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INVALID_JSON: Provide a JSON body.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error('BODY_TOO_LARGE: Request exceeds 12 KB.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('INVALID_JSON: Provide a valid JSON body.'); }
}
