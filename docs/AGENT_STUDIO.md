# Studio deployment boundary

The actual implemented artifact is `packages/agent/studio-hook.ts`, a deterministic `runWork(prompt, {sessionId})` integration. It validates JSON policy input, refuses live mode, calls the authenticated ATLAS report endpoint, and returns JSON evidence. It does not fabricate agent identity or implement its own escrow contract.

The official Studio seller verifies funded ERC-8183 jobs and signs result submission in its fixed signing layer. ATLAS's hook is used only for producing the deliverable. No trading key is passed into the hook.

Verified sources:

- https://www.bnbchain.org/en/bnb-agent-studio
- https://github.com/bnb-chain/bnbchain-skills/tree/main/plugins/bnbagent-studio
- `bnbagent-studio-adding-to-project.md` and `bnbagent-studio-selling-via-8183.md` in that repository

## Operator setup

```sh
npm install -g @bnbagent/studio-cli
bag skills install
bag init atlas-studio --destination self
```

Run `bag init` from a separate parent directory: it generates a new workspace; it does not adopt this repo in place. The current seller source is generated under `app/agent/src/`, including `sellerCore.ts`, `signing.ts`, and the selected protocol entrypoint. Inspect current generated files before modifying them.

1. Deploy the ATLAS web app and configure its `ATLAS_AGENT_TOKEN`.
2. Add ATLAS's domain schema and `studio-hook.ts` to the generated seller, or package them as a workspace dependency. Install Zod.
3. Wire the generated `runWork` developer hook to the provided implementation. Keep all Studio escrow signing in generated `signing.ts`.
4. Set `ATLAS_REPORT_URL=https://YOUR-ATLAS-HOST/api/agent/best-execution` and `ATLAS_AGENT_TOKEN` in the Studio runtime's secret configuration. The input deliverable prompt is a JSON policy, not raw calldata.
5. Configure Studio's actual wallet and selected cloud provider using its interactive setup. ATLAS supplies no raw private key.
6. Set a free service price for initial verification if desired: `bag config set payments.seller.price_usd 0`.

```sh
bag doctor
bag deploy prepare
bag deploy --provider aws
bag deploy verify --provider aws
```

Current documentation requires Node 22+; the deployment helper additionally requires Bun 1.3+. AWS deployment requires an authenticated AWS account and the Studio-provisioned OAuth authorizer. Cloud deployment and identity registration are not completed in this repo. The optional managed testnet trial is distinct from the project's BSC mainnet trading requirement.

## Completion evidence still required

- Actual HTTPS runtime status, ERC-8004 identity transaction, and registration ID.
- A real ERC-8183 task that invokes the hook and receives a valid report.
- Runtime receipt and any paid-service settlement evidence, if enabled.
- Deployment secrets and cloud billing configured by the account owner.

The UI intentionally says **Not deployed** until a real status-verification integration is added. Setting a string environment variable is not sufficient evidence of on-chain registration.
