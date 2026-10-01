import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { agentReportRequest, evaluate } from './service';
import { safeMessage } from '../core/http';
const token = process.env.ATLAS_AGENT_TOKEN;
if (!token || token.length < 32)
  throw new Error('Set ATLAS_AGENT_TOKEN to a random secret of at least 32 characters.');
let active = 0;
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const reply = (status: number, data: unknown) => {
    res.writeHead(status);
    res.end(JSON.stringify(data));
  };
  if (req.url === '/health' && req.method === 'GET') {
    reply(200, { service: 'atlas-intelligence', canBroadcast: false });
    return;
  }
  const actual = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
  if (
    Buffer.byteLength(actual) !== Buffer.byteLength(token) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(token))
  ) {
    reply(401, { error: 'Unauthorized' });
    return;
  }
  if (req.url !== '/best-execution' || req.method !== 'POST') {
    reply(404, { error: 'Not found' });
    return;
  }
  if (active >= 3) {
    reply(429, { error: 'Agent concurrency limit reached' });
    return;
  }
  active++;
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.byteLength;
      if (size > 12000) {
        reply(413, { error: 'Request too large' });
        return;
      }
      chunks.push(bytes);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    const parsed = agentReportRequest.parse(JSON.parse(body));
    if (parsed.policy.executionMode === 'live') {
      reply(400, { error: 'Intelligence reports cannot broadcast. Use quote or simulate.' });
      return;
    }
    reply(200, await evaluate(parsed, 'agent'));
  } catch (e) {
    reply(400, {
      error:
        e instanceof z.ZodError
          ? 'Invalid policy'
          : e instanceof Error
            ? safeMessage(e)
            : 'Report unavailable',
    });
  } finally {
    active--;
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.listen(Number(process.env.ATLAS_AGENT_PORT ?? 8080), '127.0.0.1', () =>
  console.log(
    'ATLAS intelligence agent listening on loopback. Place behind an authenticated HTTPS proxy for deployment.',
  ),
);
