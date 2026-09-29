import { z } from 'zod';
export function config() {
  const raw = z
    .object({
      ATLAS_DEMO_MODE: z.enum(['auto', 'true', 'false']).default('auto'),
      ATLAS_LIVE_TRADING_ENABLED: z.enum(['true', 'false']).default('false'),
      ATLAS_MAX_TRADE_USDT: z
        .string()
        .regex(/^\d+(\.\d+)?$/)
        .default('10'),
    })
    .parse(process.env);
  const credentials = !!process.env.BINANCE_WEB3_API_KEY && !!process.env.BINANCE_WEB3_API_SECRET;
  return {
    demo: raw.ATLAS_DEMO_MODE === 'true' || (raw.ATLAS_DEMO_MODE === 'auto' && !credentials),
    credentials,
    liveEnabled: raw.ATLAS_LIVE_TRADING_ENABLED === 'true',
    maxTrade: raw.ATLAS_MAX_TRADE_USDT,
    persistent: !!process.env.DATABASE_URL,
  };
}
