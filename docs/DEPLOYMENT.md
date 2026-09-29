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

No Vercel account, project, token, or Git remote was supplied to this workspace. No public deployment has been performed.

## PostgreSQL

Provision PostgreSQL 14+ with TLS and a dedicated app role. Set `DATABASE_URL` on the server and your migration shell. The adapter uses a pool of five connections and disables prepared statements for pooler compatibility.

```sh
pnpm db:migrate
```

The migration is transactional and idempotent. It creates intents, cached representations, route evaluations, immutable receipt snapshots, execution claims, and telemetry. Do not expose the connection URL to the browser. Keep backups and establish retention appropriate to your deployment. The migration and database adapter are implemented but were not tested against a provisioned PostgreSQL server in this environment.

Without PostgreSQL, the app uses temporary memory scoped by browser cookies; serverless instances do not share that state. Use PostgreSQL for a stable public judge session and for all live execution.

## Standalone agent

`pnpm agent` is a separate Node process with a concurrency limit, bounded request size, bearer authentication, and no signing. It binds loopback. Put it behind your authenticated HTTPS reverse proxy for external access. Studio deployment is documented separately in `AGENT_STUDIO.md`.

## Mainnet release check

- Signed RWA/Trading/Transaction/Wallet API calls exercised with valid portal keys.
- Independent USD per-share source with verifiable timestamps.
- Operator-verified USDT address/decimals and transaction router allowlist.
- Correct BSC RPC chain ID 56; wallet on the same chain.
- Tiny input-token balance and BNB for gas; existing required allowance.
- PostgreSQL migrations applied; receipt and execution-claim durability checked.
- Fresh SWAP quote, exact simulation, all policy checks, and explicit user confirmation.
- First real transaction verified by sender/target/value/calldata and output Transfer logs.

RFQ routes remain blocked pending a supported settlement-simulation implementation. No amount of environment configuration alone removes that limitation.
