# Deployment runbook

## Web: Vercel

1. Push this repository to your own Git provider.
2. Import into Vercel with **Root Directory `apps/web`**, framework Next.js. Enable access to files outside the root directory, since the application imports `packages/`.
3. Use pnpm and the committed workspace lockfile. Build command: `pnpm --filter @atlas/web build` from the repository root, or `pnpm build` from the app root. The Next.js output directory is the default `.next`.
4. Add root `.env.example` values to Vercel environment settings. No local env file is deployed.
5. Set `NEXT_PUBLIC_APP_URL` to the actual HTTPS origin and `NEXT_PUBLIC_GITHUB_URL` to the public repository.
6. Use `ATLAS_DEMO_MODE=true`, `ATLAS_LIVE_TRADING_ENABLED=false` for the judge demonstration until live prerequisites are verified.
7. Configure provider rate limits at the hosting ingress. Server-local limits and caches are bounded but not shared between instances.
8. Check `/api/health`, all eight routes, and `/system` on the deployed host. Export real observations after testing.

The Git remote is configured as `https://github.com/rosario1709/BNB-Hackaton.git`. Vercel login, a project and a managed production database remain external actions; no public deployment has been verified.

The root and app packages both pin Node 24.x. `apps/web/vercel.json` specifies the framework, frozen pnpm install and workspace build. Validate before publishing:

```sh
# Judge deployment: requires an HTTPS origin and persistent PostgreSQL, with demo=true and live=false.
pnpm verify:production --demo
# Live deployment: additionally requires credentials, independent reference and reviewed contracts.
pnpm verify:production
# After deployment; replace the URL with your actual deployment.
pnpm verify:deployment https://YOUR-DEPLOYMENT-HOST
# Explicitly verify the judge's fictional receipt flow even if live data is configured.
pnpm verify:deployment https://YOUR-DEPLOYMENT-HOST --demo
```

`verify:deployment` checks eight pages, response headers, health and schema availability. In demo mode, or with `--demo`, it also stores an explicitly fictional receipt and verifies browser-session isolation. The judge deployment must keep live trading disabled. It never requests a wallet signature. It accepts HTTP only for loopback testing. A locally tested production build is evidence of build/runtime compatibility; it is not a verified Vercel deployment.

## PostgreSQL

Provision PostgreSQL 14+ with TLS and a dedicated app role. Set `DATABASE_URL` on the server and your migration shell. The adapter uses a pool of five connections and disables prepared statements for pooler compatibility.

For local development, `compose.yaml` provides PostgreSQL 16 on `127.0.0.1:55432` with a persistent Docker volume. Put a generated password in the ignored `.env.db` as `POSTGRES_PASSWORD=...`, then set `DATABASE_URL=postgresql://atlas:<same-password>@127.0.0.1:55432/atlas` in the ignored `.env.local`. Start it with `docker compose up -d postgres` and apply the migration below. This workspace's local instance was configured and migrated on 2026-09-30.

```sh
pnpm db:migrate
```

The migration is transactional and idempotent. It creates intents, cached representations, route evaluations, immutable receipt snapshots, execution claims, approvals, execution review holds and telemetry. Migration `0003_execution_hash.sql` adds atomic transaction-hash binding and a unique index preventing hash reuse across executions. Do not expose the connection URL to the browser. Apply all migrations before starting a deployment; health checks validate all these tables. On 2026-10-01, a disposable PostgreSQL 16 database passed repeated migrations, owner isolation, concurrent claim/hash binding, replay rejection and immutable snapshots. A managed production database remains unconfigured.

Without PostgreSQL, the app uses temporary memory scoped by browser cookies; serverless instances do not share that state. Use PostgreSQL for a stable public judge session and for all live execution.

## Standalone agent

`pnpm agent` is a separate Node process with a concurrency limit, bounded request size, bearer authentication, and no signing. It binds loopback. Put it behind your authenticated HTTPS reverse proxy for external access. Studio deployment is documented separately in `AGENT_STUDIO.md`.

## Mainnet release check

- Signed RWA/Trading/Transaction/Wallet API calls exercised with valid portal keys.
- Independent USD per-share source with verifiable timestamps.
- Operator-verified USDT address/decimals and transaction router allowlist.
- Correct BSC RPC chain ID 56; wallet on the same chain.
- Tiny input-token balance and BNB for gas; existing allowance or a separately confirmed exact-input approval followed by a fresh evaluation.
- PostgreSQL migrations applied; receipt and execution-claim durability checked.
- Fresh SWAP quote, exact simulation, all policy checks, and explicit user confirmation.
- First real transaction verified by sender/target/value/calldata and output Transfer logs.

RFQ routes remain blocked pending a supported settlement-simulation implementation. No amount of environment configuration alone removes that limitation.
