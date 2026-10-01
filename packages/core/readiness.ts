import { address } from './domain';
export function productionReadiness(env: Record<string, string | undefined> = process.env, profile: 'demo' | 'live' = 'live') {
  const issues: string[] = [];
  const required = profile === 'live' ? ['DATABASE_URL', 'BINANCE_WEB3_API_KEY', 'BINANCE_WEB3_API_SECRET', 'ATLAS_USDT_ADDRESS'] : ['DATABASE_URL'];
  for (const key of required) if (!env[key]) issues.push(`MISSING_${key}`);
  if (profile === 'live' && !env.ATLAS_REFERENCE_URL) for (const key of ['ALPACA_API_KEY_ID', 'ALPACA_API_SECRET_KEY']) if (!env[key]) issues.push(`MISSING_${key}`);
  const validUrl = (key: string, protocols: string[], required = false) => {
    if (!env[key]) { if (required) issues.push(`MISSING_${key}`); return; }
    try { const url = new URL(env[key]!); if (!protocols.includes(url.protocol) || (url.protocol === 'https:' && (url.username || url.password))) issues.push(`INVALID_${key}`); }
    catch { issues.push(`INVALID_${key}`); }
  };
  validUrl('DATABASE_URL', ['postgres:', 'postgresql:']);
  validUrl('NEXT_PUBLIC_APP_URL', ['https:'], true);
  validUrl('NEXT_PUBLIC_GITHUB_URL', ['https:']);
  validUrl('ATLAS_REFERENCE_URL', ['https:']); validUrl('ATLAS_REPORT_URL', ['https:']);
  validUrl('BSC_RPC_URL', ['https:']);
  if (env.ATLAS_USDT_ADDRESS && !address.safeParse(env.ATLAS_USDT_ADDRESS).success) issues.push('INVALID_ATLAS_USDT_ADDRESS');
  const decimals = Number(env.ATLAS_USDT_DECIMALS ?? 18);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) issues.push('INVALID_ATLAS_USDT_DECIMALS');
  const routers = (env.ATLAS_ALLOWED_ROUTERS ?? '').split(',').map((v) => v.trim()).filter(Boolean);
  if (profile === 'live' && !routers.length) issues.push('EMPTY_ROUTER_ALLOWLIST');
  if (routers.some((v) => !address.safeParse(v).success)) issues.push('INVALID_ROUTER_ALLOWLIST');
  if (profile === 'live') {
    if (env.ATLAS_DEMO_MODE !== 'false') issues.push('LIVE_DATA_NOT_EXPLICITLY_SELECTED');
    if (env.ATLAS_LIVE_TRADING_ENABLED !== 'true') issues.push('LIVE_TRADING_DISABLED');
  } else {
    if (env.ATLAS_DEMO_MODE !== 'true') issues.push('DEMO_MODE_NOT_EXPLICITLY_SELECTED');
    if (env.ATLAS_LIVE_TRADING_ENABLED !== 'false') issues.push('DEMO_LIVE_TRADING_MUST_BE_DISABLED');
  }
  if (env.ATLAS_AGENT_TOKEN && env.ATLAS_AGENT_TOKEN.length < 32) issues.push('AGENT_TOKEN_TOO_SHORT');
  return { status: issues.length ? 'NOT READY' : 'CONFIGURATION READY', profile, issues, chainId: 56,
    notice: 'Configuration checks do not prove a funded simulation or operator contract review.', secretsPrinted: false };
}
