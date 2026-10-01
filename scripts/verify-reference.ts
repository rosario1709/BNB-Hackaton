import { independentReference, referenceConfiguration } from '../packages/market/reference';
import { safeMessage } from '../packages/core/http';
try {
  const ticker = process.argv[2] ?? 'NVDA';
  const reference = await independentReference(ticker);
  if (!reference) throw new Error(referenceConfiguration().message);
  const ageSeconds = Math.round((Date.now() - Date.parse(reference.timestamp)) / 1000);
  const fresh = ageSeconds >= -5 && ageSeconds <= 300;
  console.log(JSON.stringify({ status: fresh ? 'READY' : 'STALE REFERENCE', checkedAt: new Date().toISOString(), ticker,
    source: reference.source, currency: reference.currency, exchange: reference.exchange, independent: reference.independent,
    priceUsd: reference.price, sourceTimestamp: reference.timestamp, ageSeconds, freshForDefaultPolicy: fresh, transactionsBroadcast: 0 }, null, 2));
  if (!fresh) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ status: 'NOT READY', error: safeMessage(error), missing: referenceConfiguration().missing,
    freshForDefaultPolicy: false, transactionsBroadcast: 0 }, null, 2));
  process.exitCode = 1;
}
