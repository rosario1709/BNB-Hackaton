'use client';
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowDown,
  Command,
  Activity,
  Globe2,
  Wallet,
  Layers3,
  ShieldCheck,
  Check,
  X,
  Play,
  Search,
  FileCheck2,
  SlidersHorizontal,
  Bot,
  ChevronRight,
  ExternalLink,
  Download,
  Menu,
  RefreshCw,
  AlertTriangle,
  Workflow,
} from 'lucide-react';
import type {
  Policy,
  Receipt,
  Evaluation,
  Representation,
  Market,
  Scenario,
  Transaction,
} from '../../../packages/core/domain';
type Icon = typeof Activity;
type System = {
  mode: 'demo' | 'live';
  liveEnabled: boolean;
  credentials: boolean;
  persistence: string;
  maxTrade: string;
  integrations: { name: string; status: string }[];
  telemetry: { module: string; calls: number; errors: number; meanMs: number }[];
  observations: {
    module: string;
    operation: string;
    startedAt: string;
    durationMs: number;
    success: boolean;
    errorCode?: string;
  }[];
};
type EipProvider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
declare global {
  interface Window {
    ethereum?: EipProvider;
  }
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch('/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
}
const names: Record<string, string> = {
  bstocks: 'bStocks',
  ondo: 'Ondo',
  xstocks: 'xStocks',
  unknown: 'Other issuer',
};
const nav: { href: string; label: string; icon: Icon }[] = [
  { href: '/', label: 'Command center', icon: Command },
  { href: '/trade', label: 'Trade', icon: ArrowUpRight },
  { href: '/markets', label: 'Markets', icon: Globe2 },
  { href: '/portfolio', label: 'Portfolio', icon: Wallet },
  { href: '/receipts', label: 'Execution receipts', icon: FileCheck2 },
  { href: '/agent', label: 'ATLAS Agent', icon: Bot },
  { href: '/system', label: 'System health', icon: Activity },
];
const initial =
  'Buy $10 of NVIDIA using the best available representation. Maximum slippage 0.5%. Maximum reference deviation 1%.';
function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Empty({
  icon: Icon = Layers3,
  title,
  children,
}: {
  icon?: Icon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="error" role="alert">
      <AlertTriangle size={17} />
      {error}
    </div>
  ) : null;
}
function money(n?: string) {
  return n
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 4,
      }).format(Number(n))
    : 'Unavailable';
}
function amount(n?: string) {
  return n ? Number(n).toLocaleString('en-US', { maximumFractionDigits: 7 }) : '—';
}
export function AtlasApp({ page }: { page: string }) {
  const [system, setSystem] = useState<System>();
  const [systemError, setSystemError] = useState('');
  const [wallet, setWallet] = useState('');
  const [walletError, setWalletError] = useState('');
  const [menu, setMenu] = useState(false);
  const refresh = useCallback(() => {
    api<System>('system/status')
      .then(setSystem)
      .catch((e) => setSystemError(e.message));
  }, []);
  useEffect(() => {
    refresh();
    const stored = sessionStorage.getItem('atlas_wallet');
    if (stored) setWallet(stored);
  }, [refresh]);
  async function connect() {
    try {
      setWalletError('');
      if (!window.ethereum)
        throw new Error(
          'No browser wallet detected. Install a BSC-compatible wallet, or use the local Agentic Wallet guide on the Agent page.',
        );
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];
      if (!accounts[0]) throw new Error('Wallet did not return an account.');
      setWallet(accounts[0]);
      sessionStorage.setItem('atlas_wallet', accounts[0]);
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : 'Wallet connection declined.');
    }
  }
  const title = page
    ? (nav.find((n) => n.href === '/' + page)?.label ?? 'Judge walkthrough')
    : 'Command center';
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <Link href="/" className="brand">
          <span className="brand-mark">A</span>ATLAS
          <span className="brand-dot" />
        </Link>
        <div className="workspace-label">EXECUTION WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setMenu(false)}
              className={'nav-link ' + (n.href === '/' + page ? 'active' : '')}
            >
              <n.icon size={18} />
              {n.label}
              {n.href === '/trade' && <span className="key">↗</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/judge" className="judge-link">
            <Play size={16} />
            <div>
              Take the guided tour<small>Built for a closer look</small>
            </div>
            <ChevronRight size={15} />
          </Link>
          <div className="network">
            <span className="network-icon">◇</span>
            <div>
              BNB Smart Chain<small>Mainnet · Chain ID 56</small>
            </div>
            <span className="dot" />
          </div>
          <span className="version">ATLAS / EXECUTION ENGINE v0.1</span>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Toggle navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <Badge tone={system?.mode === 'demo' ? 'amber' : 'green'}>
              {system ? (system.mode === 'demo' ? 'DEMO DATA' : 'LIVE DATA') : 'CHECKING CONFIG'}
            </Badge>
            <button className="wallet-button" onClick={connect}>
              <Wallet size={15} />
              {wallet ? wallet.slice(0, 6) + '…' + wallet.slice(-4) : 'Connect wallet'}
            </button>
          </div>
        </header>
        <main>
          <ErrorBox error={systemError || walletError} />
          {system?.mode === 'demo' && (
            <div className="mode-note">
              <span className="small-dot" />
              Demo workspace · Fictional markets and simulations. No funds move.
              <Link href="/system">
                View configuration <ArrowUpRight size={12} />
              </Link>
            </div>
          )}
          {(page === '' || page === 'trade') && (
            <Trade home={page === ''} system={system} wallet={wallet} onComplete={refresh} />
          )}
          {page === 'markets' && <Markets />}
          {page === 'portfolio' && <Portfolio wallet={wallet} connect={connect} />}
          {page === 'receipts' && <Receipts />}
          {page === 'system' && <SystemPage system={system} refresh={refresh} />}
          {page === 'agent' && <Agent />}
          {page === 'judge' && <Judge system={system} wallet={wallet} onComplete={refresh} />}
        </main>
        <footer>
          <span>
            ATLAS optimizes execution according to user-defined constraints. It does not provide
            investment advice.
          </span>
          <span>INTENT → EVIDENCE → EXECUTION</span>
        </footer>
      </div>
    </div>
  );
}
function Trade({
  home = false,
  system,
  wallet,
  onComplete,
  preset,
}: {
  home?: boolean;
  system?: System;
  wallet: string;
  onComplete: () => void;
  preset?: Scenario;
}) {
  const [text, setText] = useState(initial);
  const [policy, setPolicy] = useState<Policy>();
  const [receipt, setReceipt] = useState<Receipt>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [scenario, setScenario] = useState<Scenario>(preset ?? 'successful-best-execution');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<{ executionId: string; transactionHash: string }>();
  useEffect(() => {
    if (preset) {
      setScenario(preset);
      setReceipt(undefined);
      setPolicy(undefined);
    }
  }, [preset]);
  const run = async (mode: 'quote' | 'simulate' | 'live', edited?: Policy) => {
    try {
      setError('');
      setBusy('Compiling policy');
      setReceipt(undefined);
      setConfirmed(false);
      const parsed = edited ?? (await api<{ policy: Policy }>('intent/parse', { text })).policy;
      const p = {
        ...parsed,
        executionMode: mode,
        maxReferenceDeviationBps: scenario === 'policy-block' ? 1 : parsed.maxReferenceDeviationBps,
      };
      setPolicy(p);
      setBusy(
        mode === 'quote'
          ? 'Comparing executable routes'
          : 'Comparing routes and running simulations',
      );
      const r = await api<Receipt>('routes/evaluate', {
        policy: p,
        wallet: wallet || undefined,
        scenario,
        userText: text,
      });
      setReceipt(r);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Evaluation failed.');
    } finally {
      setBusy('');
    }
  };
  async function execute() {
    if (!receipt || !window.ethereum) return;
    try {
      setError('');
      setBusy('Rechecking mainnet policy');
      const chain = await window.ethereum.request({ method: 'eth_chainId' });
      if (chain !== '0x38')
        throw new Error('Switch your wallet to BNB Smart Chain mainnet (56) before signing.');
      const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
      if (accounts[0]?.toLowerCase() !== wallet.toLowerCase())
        throw new Error('Wallet account changed. Reconnect and evaluate again.');
      const prepared = await api<{
        transaction: Transaction;
        executionId: string;
        expiresAt: string;
      }>('execute', { receiptId: receipt.id, wallet, confirmed });
      if (Date.now() >= Date.parse(prepared.expiresAt))
        throw new Error('Quote expired before signing.');
      setBusy('Review transaction in your wallet');
      const transactionHash = (await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [
          {
            ...prepared.transaction,
            value: '0x' + BigInt(prepared.transaction.value).toString(16),
            chainId: '0x38',
          },
        ],
      })) as string;
      const p = { executionId: prepared.executionId, transactionHash };
      setPending(p);
      sessionStorage.setItem('atlas_pending', JSON.stringify(p));
      setReceipt(await api<Receipt>('execute/verify', p));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Execution rejected.');
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      {!preset && (
        <section className={home ? 'hero' : 'page-heading'}>
          <div>
            <div className="eyebrow">
              <span className="line" />
              AUTONOMOUS EXECUTION INTELLIGENCE
            </div>
            <h1>
              {home ? (
                <>
                  One intent.
                  <br />
                  Every market.
                  <br />
                  <em>Best execution.</em>
                </>
              ) : (
                'Your intent. Your rules.'
              )}
            </h1>
            <p>
              {home
                ? 'The execution layer for tokenized equities. Compare available representations, test every route, and proceed only when your policy passes.'
                : 'Turn an equity trade into a clear, verifiable execution policy.'}
            </p>
            {home && (
              <div className="hero-links">
                <Link href="/markets">
                  Explore markets <ArrowUpRight size={16} />
                </Link>
                <span>Spot only. BSC native.</span>
              </div>
            )}
          </div>
          {home && (
            <div className="routing-visual" aria-label="Routing architecture illustration">
              <div className="visual-label">ONE EXPOSURE. MULTIPLE PATHS.</div>
              <div className="intent-node">
                <Command size={18} />
                <span>Your intent</span>
                <small>Choose your equity</small>
              </div>
              <div className="connector-line" />
              <div className="route-nodes">
                {['Discover', 'Compare', 'Simulate'].map((v, i) => (
                  <div key={v}>
                    <span>0{i + 1}</span>
                    {v}
                    <span className="node-dash" />
                  </div>
                ))}
              </div>
              <div className="connector-line" />
              <div className="policy-node">
                <ShieldCheck size={17} />
                Deterministic policy gate<span>✓</span>
              </div>
              <div className="visual-caption">Every decision leaves an evidence trail.</div>
            </div>
          )}
        </section>
      )}
      <div className="trade-grid">
        <section className="panel intent-panel">
          <div className="panel-heading">
            <div>
              <Command size={18} />
              <h2>What do you want to execute?</h2>
            </div>
            <span className="micro">01 / INTENT</span>
          </div>
          <label htmlFor="intent" className="sr-only">
            Trade intent
          </label>
          <textarea
            id="intent"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPolicy(undefined);
              setReceipt(undefined);
            }}
            spellCheck={false}
          />
          <div className="suggestions">
            {['NVIDIA', 'Apple', 'Tesla'].map((t) => (
              <button
                key={t}
                onClick={() => {
                  setText(initial.replace('NVIDIA', t));
                  setReceipt(undefined);
                  setPolicy(undefined);
                }}
              >
                {t}
                <ArrowUpRight size={11} />
              </button>
            ))}
          </div>
          <div className="intent-bottom">
            <span>
              <ShieldCheck size={14} />
              Simulation by default
            </span>
            <div>
              <button className="button secondary" disabled={!!busy} onClick={() => run('quote')}>
                Analyze <ArrowRight size={14} />
              </button>
              <button className="button primary" disabled={!!busy} onClick={() => run('simulate')}>
                <Play size={14} />
                Simulate routes
              </button>
            </div>
          </div>
        </section>
        <section className="panel guard-panel">
          <div className="panel-heading">
            <div>
              <SlidersHorizontal size={18} />
              <h2>Execution guardrails</h2>
            </div>
          </div>
          <div className="guard-row">
            <span>Network</span>
            <strong>
              BNB Smart Chain <span className="dot" />
            </strong>
          </div>
          <div className="guard-row">
            <span>Decision engine</span>
            <strong>Deterministic</strong>
          </div>
          <div className="guard-row">
            <span>Signing</span>
            <strong>User controlled</strong>
          </div>
          <div className="guard-row">
            <span>Live trade cap</span>
            <strong>{system ? money(system.maxTrade) : '—'}</strong>
          </div>
          <div className="guard-foot">
            <ShieldCheck size={16} />
            <span>
              A failed check stops execution.
              <br />
              Your constraints are the final authority.
            </span>
          </div>
        </section>
      </div>
      {system?.mode === 'demo' && !preset && (
        <div className="scenario-bar">
          <span>DEMO SCENARIO</span>
          <select
            aria-label="Demo scenario"
            value={scenario}
            onChange={(e) => {
              setScenario(e.target.value as Scenario);
              setReceipt(undefined);
            }}
          >
            <option value="successful-best-execution">Best execution · two valid routes</option>
            <option value="policy-block">Policy block · strict deviation</option>
            <option value="stale-reference">Stale reference · market closed</option>
            <option value="simulation-failure">Simulation failure · funds protected</option>
          </select>
        </div>
      )}
      <ErrorBox error={error} />
      {policy && (
        <section className="panel policy-editor">
          <div className="panel-heading">
            <div>
              <FileCheck2 size={18} />
              <h2>Compiled policy</h2>
            </div>
            <Badge>DETERMINISTIC</Badge>
          </div>
          <div className="policy-fields">
            <label>
              Asset
              <input
                value={policy.ticker}
                onChange={(e) => {
                  setPolicy({ ...policy, ticker: e.target.value });
                  setReceipt(undefined);
                }}
              />
            </label>
            <label>
              Amount ({policy.denomination})
              <input
                inputMode="decimal"
                value={policy.amount}
                onChange={(e) => {
                  setPolicy({ ...policy, amount: e.target.value });
                  setReceipt(undefined);
                }}
              />
            </label>
            <label>
              Max slippage (bps)
              <input
                type="number"
                min="0"
                max="500"
                value={policy.maxSlippageBps}
                onChange={(e) => {
                  setPolicy({ ...policy, maxSlippageBps: Number(e.target.value) });
                  setReceipt(undefined);
                }}
              />
            </label>
            <label>
              Max deviation (bps)
              <input
                type="number"
                min="0"
                max="1000"
                value={policy.maxReferenceDeviationBps}
                onChange={(e) => {
                  setPolicy({ ...policy, maxReferenceDeviationBps: Number(e.target.value) });
                  setReceipt(undefined);
                }}
              />
            </label>
            <label>
              Mode
              <select
                value={policy.executionMode}
                onChange={(e) => {
                  setPolicy({
                    ...policy,
                    executionMode: e.target.value as Policy['executionMode'],
                  });
                  setReceipt(undefined);
                }}
              >
                <option value="quote">Quote only</option>
                <option value="simulate">Simulate</option>
                <option value="live" disabled={!system?.liveEnabled || system.mode === 'demo'}>
                  Live · explicit confirmation
                </option>
              </select>
            </label>
          </div>
          {policy.side === 'sell' && (
            <label className="holding-label">
              Sell holding contract
              <input
                placeholder="0x… (selected token you actually hold)"
                value={policy.sellTokenAddress ?? ''}
                onChange={(e) => {
                  setPolicy({ ...policy, sellTokenAddress: e.target.value });
                  setReceipt(undefined);
                }}
              />
            </label>
          )}
          <div className="policy-actions">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={policy.allowWhenReferenceStale}
                onChange={(e) => {
                  setPolicy({ ...policy, allowWhenReferenceStale: e.target.checked });
                  setReceipt(undefined);
                }}
              />
              Allow stale references (price deviation still enforced)
            </label>
            <button
              className="button secondary"
              disabled={!!busy}
              onClick={() => run(policy.executionMode, policy)}
            >
              Re-evaluate policy <RefreshCw size={13} />
            </button>
          </div>
        </section>
      )}
      {busy && (
        <div className="progress" role="status">
          <span className="spinner" />
          <div>
            {busy}
            <small>Candidate failures are isolated. Every required check must pass.</small>
          </div>
        </div>
      )}
      {receipt ? (
        <>
          <Race receipt={receipt} />
          {receipt.decision === 'approved' && receipt.intent.executionMode === 'live' && (
            <section className="panel confirm-panel">
              <h2>Review mainnet execution</h2>
              <p>
                Mainnet execution moves real assets. Review the route and confirm before proceeding.
              </p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I confirm this {receipt.intent.amount} {receipt.intent.denomination} trade and its
                policy limits.
              </label>
              <button
                className="button primary"
                disabled={!confirmed || !wallet || !!busy || !!pending}
                onClick={execute}
              >
                Confirm in wallet <Wallet size={15} />
              </button>
              {pending && (
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      setReceipt(await api<Receipt>('execute/verify', pending));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Check transaction status
                </button>
              )}
            </section>
          )}
        </>
      ) : (
        !busy && (
          <section className="panel awaiting">
            <div className="section-label">
              <Workflow size={18} />
              <h2>Simulation Race</h2>
              <Badge>AWAITING INTENT</Badge>
            </div>
            <div className="awaiting-steps">
              {[
                {
                  icon: Layers3,
                  title: 'Discover representations',
                  text: 'Find available BSC stock tokens.',
                },
                {
                  icon: SlidersHorizontal,
                  title: 'Compare real execution',
                  text: 'Normalize shares, costs, and output.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Test your constraints',
                  text: 'Simulate, verify, select — or refuse.',
                },
              ].map((s, i) => (
                <div key={s.title}>
                  <span className="step-number">0{i + 1}</span>
                  <s.icon size={23} />
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              ))}
            </div>
          </section>
        )
      )}
    </>
  );
}
function Race({ receipt }: { receipt: Receipt }) {
  const winner = receipt.candidates.find((c) => c.id === receipt.selectedRouteId);
  return (
    <section className="race">
      <div className="section-title">
        <div>
          <div className="eyebrow">EVIDENCE BEFORE EXECUTION</div>
          <h2>{receipt.status === 'quoted' ? 'Route comparison' : 'Simulation Race'}</h2>
        </div>
        <Badge tone={receipt.decision === 'approved' ? 'green' : 'red'}>
          {receipt.decision === 'approved' ? 'POLICY PASSED' : 'TRADE BLOCKED'}
        </Badge>
      </div>
      <div className="race-cards">
        {receipt.candidates.map((e) => (
          <RouteCard
            key={e.id}
            evaluation={e}
            winner={e.id === receipt.selectedRouteId}
            demo={receipt.dataMode === 'demo'}
          />
        ))}
      </div>
      <div className={`decision ${winner ? 'selected' : 'blocked'}`}>
        <div className="decision-icon">{winner ? <ShieldCheck size={25} /> : <X size={25} />}</div>
        <div>
          <span className="micro">{winner ? 'SELECTED ROUTE' : 'EXECUTION REFUSED'}</span>
          <h3>
            {winner
              ? `${names[winner.representation.provider]} · ${winner.representation.symbol}`
              : 'Your policy protected this trade.'}
          </h3>
          <p>{receipt.reason}</p>
        </div>
        <div className="decision-output">
          {winner && (
            <>
              <span>NET {receipt.intent.side === 'buy' ? 'SHARE EXPOSURE' : 'USDT PROCEEDS'}</span>
              <strong>{amount(winner.netOutput)}</strong>
            </>
          )}
          <small>
            {receipt.status === 'pending'
              ? 'Confirmation pending'
              : receipt.status === 'reverted'
                ? 'Reverted · gas may be spent'
                : receipt.executed
                  ? receipt.verification === 'mismatch'
                    ? 'On-chain flow review required'
                    : 'Confirmed on BSC'
                  : 'Funds moved: NO'}
          </small>
        </div>
      </div>
      <div className="panel timeline">
        <div className="panel-heading">
          <h3>Execution evidence</h3>
          <Link href="/receipts">
            View receipts <ArrowUpRight size={13} />
          </Link>
        </div>
        {receipt.timeline.map((step, i) => (
          <div className="timeline-item" key={i}>
            <Check size={13} />
            <span>{step.label}</span>
            <time>{new Date(step.at).toLocaleTimeString()}</time>
            <span>{step.durationMs} ms</span>
          </div>
        ))}
        <div className="receipt-meta">
          <span>
            {receipt.dataMode.toUpperCase()} · {receipt.status.toUpperCase()} ·{' '}
            {receipt.id.slice(0, 8)}
          </span>
          <button className="text-button" onClick={() => download(receipt)}>
            <Download size={13} />
            Export evidence
          </button>
        </div>
        {receipt.blockExplorerUrl && (
          <a href={receipt.blockExplorerUrl} target="_blank" rel="noreferrer">
            View verified transaction <ExternalLink size={14} />
          </a>
        )}
      </div>
    </section>
  );
}
function RouteCard({
  evaluation: e,
  winner,
  demo,
}: {
  evaluation: Evaluation;
  winner: boolean;
  demo: boolean;
}) {
  return (
    <article className={`route-card ${winner ? 'winner' : ''}`}>
      <div className="route-heading">
        <span className={'provider-logo ' + e.representation.provider}>
          {names[e.representation.provider].slice(0, 1)}
        </span>
        <div>
          <h3>{names[e.representation.provider]}</h3>
          <span>
            {e.representation.symbol} · {e.quote?.vendor ?? 'No quote'}
          </span>
        </div>
        <Badge tone={winner ? 'green' : e.eligible ? 'neutral' : 'red'}>
          {winner ? 'SELECTED' : e.eligible ? 'VALID' : 'REJECTED'}
        </Badge>
      </div>
      <div className="route-output">
        <span>Expected token output</span>
        <strong>{amount(e.quote?.expectedAmountOut)}</strong>
        <small>{demo ? 'Fictional demo quote' : (e.quote?.executionMode ?? 'Unavailable')}</small>
      </div>
      <dl>
        <div>
          <dt>On-chain token price</dt>
          <dd>{money(e.market.onchainPrice)}</dd>
        </div>
        <div>
          <dt>Independent reference / share</dt>
          <dd>{money(e.market.referencePrice)}</dd>
        </div>
        <div>
          <dt>Reference deviation</dt>
          <dd
            className={
              e.deviationBps !== undefined &&
              e.checks.find((c) => c.code === 'DEVIATION')?.status === 'fail'
                ? 'danger'
                : ''
            }
          >
            {e.deviationBps === undefined ? 'Unknown' : (e.deviationBps / 100).toFixed(2) + '%'}
          </dd>
        </div>
        <div>
          <dt>Slippage limit / impact</dt>
          <dd>
            {e.quote
              ? `${(e.quote.slippageBps / 100).toFixed(2)}% / ${e.quote.priceImpactBps === undefined ? '?' : (e.quote.priceImpactBps / 100).toFixed(2) + '%'}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Estimated gas</dt>
          <dd>{money(e.quote?.gasUsd)}</dd>
        </div>
        <div>
          <dt>Market / reference age</dt>
          <dd>
            {e.market.marketStatus} /{' '}
            {e.market.referenceTimestamp
              ? Math.max(
                  0,
                  Math.round((Date.now() - Date.parse(e.market.referenceTimestamp)) / 60000),
                ) + 'm'
              : 'unknown'}
          </dd>
        </div>
      </dl>
      <div className="route-checks">
        <span className={e.quote ? 'success' : 'danger'}>
          {e.quote ? <Check size={13} /> : <X size={13} />}QUOTE {e.quote ? 'PASS' : 'FAIL'}
        </span>
        <span className={e.simulation?.success ? 'success' : e.simulation ? 'danger' : ''}>
          {e.simulation?.success ? <Check size={13} /> : <span>—</span>}SIM{' '}
          {e.simulation ? (e.simulation.success ? 'PASS' : 'FAIL') : 'NOT RUN'}
        </span>
      </div>
      <details>
        <summary>
          {e.eligible
            ? 'Why this route passed'
            : `${e.rejectionReasons.length} blocking reason${e.rejectionReasons.length === 1 ? '' : 's'}`}
        </summary>
        {e.checks.map((c) => (
          <div key={c.code} className="check-detail">
            <span
              className={
                c.status === 'fail' ? 'danger' : c.status === 'pass' ? 'success' : 'amber-text'
              }
            >
              {c.status.toUpperCase()}
            </span>
            <p>
              <strong>{c.label}</strong>
              {c.explanation}
              {c.observed !== undefined && (
                <small>
                  Observed: {c.observed}
                  {c.threshold !== undefined ? ` · limit: ${c.threshold}` : ''}
                </small>
              )}
            </p>
          </div>
        ))}
      </details>
    </article>
  );
}
function download(data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'atlas-evidence.json';
  a.click();
  URL.revokeObjectURL(url);
}
function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{children}</p>
    </div>
  );
}
function Markets() {
  const [query, setQuery] = useState('NVDA');
  const [rows, setRows] = useState<
    { representation: Representation; market?: Market; error?: string }[]
  >([]);
  const [mode, setMode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const search = useCallback(async (q: string, source?: string) => {
    try {
      setBusy(true);
      setError('');
      const result = await api<{ mode: string; rows: typeof rows }>(
        'markets?q=' + encodeURIComponent(q) + (source === 'public' ? '&source=public' : ''),
      );
      setRows(result.rows);
      setMode(result.mode);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void search('NVDA');
  }, [search]);
  return (
    <>
      <Heading eyebrow="DISCOVER THE AVAILABLE EXPOSURE" title="One equity. Every representation.">
        Issuer, liquidity, and execution differ. Start with the underlying asset and inspect the
        available BSC tokens.
      </Heading>
      <form
        className="searchbar"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <Search size={18} />
        <input
          aria-label="Search markets"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ticker or company name"
        />
        <button className="button primary" disabled={busy}>
          Search markets
        </button>
      </form>
      <div className="scenario-bar">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => search(query, 'public')}
        >
          Live discovery · no API key <Globe2 size={13} />
        </button>
        <span>Public Wallet Skill · use an exact ticker</span>
      </div>
      <ErrorBox error={error} />
      <div className="section-title">
        <h2>
          Available representations <span className="count">{rows.length}</span>
        </h2>
        <Badge>{mode ? mode.toUpperCase() + ' DATA' : 'LOADING'}</Badge>
      </div>
      {busy ? (
        <div className="progress" role="status">
          <span className="spinner" />
          Discovering official representations…
        </div>
      ) : rows.length ? (
        <div className="market-grid">
          {rows.map(({ representation: r, market: m, error }) => (
            <article className="panel market-card" key={r.tokenAddress}>
              <div className="market-title">
                <span className="ticker-logo">{r.ticker.slice(0, 1)}</span>
                <div>
                  <h3>{r.ticker}</h3>
                  <span>{r.companyName}</span>
                </div>
                <Badge>{names[r.provider]}</Badge>
              </div>
              <div className="market-price">
                {money(m?.onchainPrice)}
                <small>on-chain / token</small>
              </div>
              <dl>
                <div>
                  <dt>Independent reference</dt>
                  <dd>{money(m?.referencePrice)}</dd>
                </div>
                <div>
                  <dt>Token-derived / share</dt>
                  <dd>{money(m?.derivedReferencePrice)}</dd>
                </div>
                <div>
                  <dt>Shares per token</dt>
                  <dd>{r.sharesPerToken}</dd>
                </div>
                <div>
                  <dt>Market status</dt>
                  <dd>{m?.marketStatus ?? r.status}</dd>
                </div>
                <div>
                  <dt>Reference age</dt>
                  <dd>
                    {m?.referenceTimestamp
                      ? Math.round((Date.now() - Date.parse(m.referenceTimestamp)) / 60000) + ' min'
                      : 'Unknown'}
                  </dd>
                </div>
              </dl>
              <p className="contract">{r.tokenAddress}</p>
              {error && <p className="danger">{error}</p>}
              <small className="muted">
                Observed {new Date(m?.observedAt ?? r.sourceTimestamp).toLocaleTimeString()}
              </small>
              <Link className="market-link" href="/trade">
                Evaluate an intent <ArrowUpRight size={15} />
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="No supported BSC representation found">
          Try an exact ticker or a company name. ATLAS never invents a listing.
        </Empty>
      )}
      <p className="fineprint">
        Token-derived reference prices are per-share conversions, not independent stock exchange
        quotes. Tokenized securities may have issuer, liquidity, smart-contract, market-hours and
        jurisdictional risks.
      </p>
    </>
  );
}
function Portfolio({ wallet, connect }: { wallet: string; connect: () => void }) {
  const [data, setData] = useState<{
    assets: { symbol: string; balance: string; tokenPrice: string; tokenContractAddress: string }[];
    holdings?: {
      ticker: string;
      provider: string;
      underlyingShares: string;
      valueUsd: string;
      tokenContractAddress: string;
    }[];
    distribution?: { provider: string; valueUsd: string }[];
    totalEquityUsd?: string;
    recentExecutions?: Receipt[];
    notice: string;
  }>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (wallet)
      api<NonNullable<typeof data>>('portfolio?address=' + wallet)
        .then(setData)
        .catch((e) => setError(e.message));
  }, [wallet]);
  return (
    <>
      <Heading eyebrow="YOUR WALLET. YOUR ASSETS." title="Portfolio">
        Inspect BSC balances directly from your connected address.
      </Heading>
      <ErrorBox error={error} />
      {!wallet ? (
        <section className="panel">
          <Empty icon={Wallet} title="Connect your wallet">
            Your balances stay yours. Connecting lets ATLAS read your holdings; signing always
            requires your wallet.
          </Empty>
          <div className="center">
            <button className="button primary" onClick={connect}>
              Connect wallet <Wallet size={15} />
            </button>
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <h2>BSC wallet</h2>
            <Badge>READ ONLY</Badge>
          </div>
          <p className="contract">{wallet}</p>
          <p>{data?.notice ?? 'Loading balances…'}</p>
          {data?.totalEquityUsd !== undefined && (
            <div className="portfolio-summary">
              <div>
                <small>OBSERVED TOKENIZED EQUITY VALUE</small>
                <h2>{money(data.totalEquityUsd)}</h2>
              </div>
              {data.distribution?.map((d) => (
                <div key={d.provider}>
                  <small>{names[d.provider]}</small>
                  <h3>{money(d.valueUsd)}</h3>
                </div>
              ))}
            </div>
          )}
          {!!data?.holdings?.length && (
            <>
              <h3>Underlying equity exposure</h3>
              <div className="balance-list">
                {data.holdings.map((h) => (
                  <div key={h.tokenContractAddress}>
                    <strong>
                      {h.ticker} · {names[h.provider]}
                    </strong>
                    <span>{amount(h.underlyingShares)} shares</span>
                    <span>{money(h.valueUsd)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {data?.assets.length ? (
            <div className="balance-list">
              {data.assets.map((a) => (
                <div key={a.tokenContractAddress}>
                  <strong>{a.symbol}</strong>
                  <span>{amount(a.balance)}</span>
                  <span>{money(String(Number(a.balance) * Number(a.tokenPrice)))}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={Wallet} title="No balances to display">
              No portfolio amounts are fabricated. In live mode, this view reads the Wallet API.
            </Empty>
          )}
          {!!data?.recentExecutions?.length && (
            <div className="notice">
              {data.recentExecutions.length} recent confirmed execution(s) in this session.{' '}
              <Link href="/receipts">Inspect receipts →</Link>
            </div>
          )}
        </section>
      )}
    </>
  );
}
function Receipts() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('all');
  const [provider, setProvider] = useState('all');
  const [date, setDate] = useState('');
  const [selected, setSelected] = useState<Receipt>();
  const [error, setError] = useState('');
  const [temporary, setTemporary] = useState(false);
  const [pending, setPending] = useState<{ executionId: string; transactionHash: string }>();
  useEffect(() => {
    api<{ receipts: Receipt[]; temporary: boolean }>('receipts')
      .then((r) => {
        setReceipts(r.receipts);
        setTemporary(r.temporary);
      })
      .catch((e) => setError(e.message));
    const saved = sessionStorage.getItem('atlas_pending');
    if (saved)
      try {
        setPending(JSON.parse(saved));
      } catch {
        /* Invalid session data */
      }
  }, []);
  const filtered = receipts.filter(
    (r) =>
      (!filter || r.intent.ticker.toLowerCase().includes(filter.toLowerCase())) &&
      (status === 'all' || r.decision === status) &&
      (provider === 'all' ||
        r.candidates.find((c) => c.id === r.selectedRouteId)?.representation.provider ===
          provider) &&
      (!date || r.createdAt.slice(0, 10) === date),
  );
  return (
    <>
      <Heading eyebrow="AN AUDIT TRAIL FOR EVERY DECISION" title="Execution receipts">
        Quotes, rejected trades, and confirmed executions — with the policy and evidence that
        produced them.
      </Heading>
      {temporary && (
        <div className="notice">
          Temporary local persistence. Receipts reset when this server restarts and are scoped to
          this browser session.
        </div>
      )}
      <ErrorBox error={error} />
      {pending && (
        <div className="notice">
          Submitted transaction {pending.transactionHash.slice(0, 12)}…{' '}
          <button
            className="text-button"
            onClick={async () => {
              try {
                const r = await api<Receipt>('execute/verify', pending);
                setSelected(r);
                setReceipts([r, ...receipts]);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Refresh on-chain status
          </button>
        </div>
      )}
      <div className="filterbar">
        <input
          aria-label="Filter receipts by ticker"
          placeholder="Filter by ticker"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          aria-label="Filter receipt status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All decisions</option>
          <option value="approved">Approved</option>
          <option value="blocked">Blocked</option>
        </select>
        <select
          aria-label="Filter provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          <option value="all">All providers</option>
          {Object.entries(names).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Filter date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {filtered.length ? (
        <div className="receipt-list">
          {filtered.map((r) => (
            <button className="receipt-row" key={r.id} onClick={() => setSelected(r)}>
              <FileCheck2 size={20} />
              <div>
                <strong>
                  {r.intent.side.toUpperCase()} {r.intent.ticker}
                </strong>
                <small>
                  {r.id.slice(0, 8)} · {new Date(r.createdAt).toLocaleString()}
                </small>
              </div>
              <span>
                {r.intent.amount} {r.intent.denomination}
              </span>
              <Badge>{r.dataMode.toUpperCase()}</Badge>
              <Badge tone={r.decision === 'approved' ? 'green' : 'red'}>
                {r.status.toUpperCase()}
              </Badge>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <Empty icon={FileCheck2} title="No matching receipts yet">
          Run a route evaluation to create an auditable receipt, including for a blocked trade.
        </Empty>
      )}
      {selected && <Race receipt={selected} />}
    </>
  );
}
function SystemPage({ system, refresh }: { system?: System; refresh: () => void }) {
  return (
    <>
      <Heading eyebrow="OPERATIONAL TRANSPARENCY" title="Evidence, not integration badges.">
        Connection status comes from configuration and measured calls. A configured key is not proof
        of a successful integration.
      </Heading>
      <div className="section-title">
        <h2>Integration status</h2>
        <button className="button secondary" onClick={refresh}>
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>
      <div className="system-grid">
        {system?.integrations.map((s) => (
          <div className="panel integration-card" key={s.name}>
            <Activity size={20} />
            <h3>{s.name}</h3>
            <Badge tone={s.status === 'Observed successful call' ? 'green' : 'neutral'}>
              {s.status}
            </Badge>
            <p>
              {system.telemetry.find((t) => t.module === s.name)
                ? `${system.telemetry.find((t) => t.module === s.name)!.calls} measured calls · ${system.telemetry.find((t) => t.module === s.name)!.meanMs} ms mean`
                : 'No successful runtime claim without evidence.'}
            </p>
          </div>
        ))}
      </div>
      <div className="panel system-config">
        <h2>Runtime configuration</h2>
        <dl>
          <div>
            <dt>Data mode</dt>
            <dd>{system?.mode ?? 'Loading'}</dd>
          </div>
          <div>
            <dt>Live execution</dt>
            <dd>{system?.liveEnabled ? 'Enabled · guardrails required' : 'Disabled'}</dd>
          </div>
          <div>
            <dt>Persistence</dt>
            <dd>{system?.persistence}</dd>
          </div>
          <div>
            <dt>Independent reference</dt>
            <dd>Required for policy approval in live data mode</dd>
          </div>
        </dl>
      </div>
      <section className="panel telemetry">
        <div className="panel-heading">
          <h2>Measured API observations</h2>
          <button className="text-button" onClick={() => download(system?.observations ?? [])}>
            <Download size={14} />
            Export
          </button>
        </div>
        {system?.observations.length ? (
          system.observations.map((o, i) => (
            <div className="telemetry-row" key={i}>
              <Badge tone={o.success ? 'green' : 'red'}>{o.success ? 'PASS' : 'FAIL'}</Badge>
              <div>
                {o.module}
                <small>{o.operation}</small>
              </div>
              <span>{o.durationMs} ms</span>
              <span>{o.errorCode ?? 'Validated'}</span>
            </div>
          ))
        ) : (
          <Empty icon={Activity} title="No external API observations yet">
            Demo simulations are not counted as Binance API calls.
          </Empty>
        )}
      </section>
    </>
  );
}
function Agent() {
  const [input, setInput] = useState(
    '{\n  "ticker": "NVDA",\n  "amount": "10",\n  "side": "buy",\n  "executionMode": "simulate"\n}',
  );
  const [token, setToken] = useState('');
  const [report, setReport] = useState<Receipt>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Heading
        eyebrow="DECISION BY ATLAS. EXECUTION BY YOUR WALLET."
        title="Execution intelligence, for agents."
      >
        Humans use the workspace. Agents use the same deterministic engine through a structured API.
        The intelligence service cannot broadcast.
      </Heading>
      <div className="agent-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <Bot size={20} />
              <h2>ATLAS Agent</h2>
            </div>
            <Badge>LOCAL SERVICE</Badge>
          </div>
          <dl>
            <div>
              <dt>Runtime</dt>
              <dd>pnpm agent</dd>
            </div>
            <div>
              <dt>Agent Studio</dt>
              <dd>Not deployed</dd>
            </div>
            <div>
              <dt>ERC-8004 identity</dt>
              <dd>Not registered</dd>
            </div>
            <div>
              <dt>ERC-8183</dt>
              <dd>runWork hook implemented</dd>
            </div>
            <div>
              <dt>x402 / b402</dt>
              <dd>Not configured</dd>
            </div>
          </dl>
          <p className="fineprint">
            No registration IDs or payment receipts are generated without on-chain evidence.
          </p>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <Wallet size={20} />
              <h2>Agentic Wallet bridge</h2>
            </div>
            <Badge>LOCAL CLI</Badge>
          </div>
          <p>
            Use Binance’s authenticated wallet for status, balances, security settings, and
            transaction previews. ATLAS never changes wallet security settings.
          </p>
          <code className="code-block">
            pnpm wallet status
            <br />
            pnpm wallet balance
            <br />
            pnpm wallet settings
          </code>
          <p className="fineprint">
            Install and sign in with the official Agentic Wallet CLI. Set ATLAS_BAW_EXECUTABLE to
            its local executable. Preview requires Developer Mode enabled by you in Binance.
          </p>
          <a
            className="text-link"
            href="https://developers.binance.com/en/docs/products/agentic-wallet/quickstart/install-agentic-wallet"
            target="_blank"
            rel="noreferrer"
          >
            Official installation guide <ExternalLink size={14} />
          </a>
        </section>
      </div>
      <section className="panel api-console">
        <div className="panel-heading">
          <h2>Best Execution Report API</h2>
          <Badge>POST /api/agent/best-execution</Badge>
        </div>
        <label>
          Request body
          <textarea
            aria-label="Agent request JSON"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>
        <label>
          Agent bearer token
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ATLAS_AGENT_TOKEN (never saved in the browser)"
          />
        </label>
        <ErrorBox error={error} />
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            try {
              setBusy(true);
              setError('');
              const response = await fetch('/api/agent/best-execution', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(JSON.parse(input)),
              });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error);
              setReport(result);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Request execution report <ArrowRight size={14} />
        </button>
      </section>
      {report && <Race receipt={report} />}
      <section className="panel architecture" id="architecture">
        <h2>The execution architecture</h2>
        <div>
          {[
            'Validated intent',
            'Official discovery',
            'Comparable quotes',
            'Deterministic checks',
            'Simulation',
            'User confirmation',
            'Wallet → BSC',
            'Verified receipt',
          ].map((s, i) => (
            <span key={s}>
              <b>{String(i + 1).padStart(2, '0')}</b>
              {s}
              {i < 7 && <ArrowDown size={14} />}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
function Judge({
  system,
  wallet,
  onComplete,
}: {
  system?: System;
  wallet: string;
  onComplete: () => void;
}) {
  const [scenario, setScenario] = useState<Scenario>('successful-best-execution');
  return (
    <>
      <Heading eyebrow="THE 90-SECOND WALKTHROUGH" title="Watch the policy make the decision.">
        One exposure, competing routes, and a system that knows when to refuse. Run a successful
        simulation, then tighten the constraints.
      </Heading>
      <div className="judge-steps">
        {[
          'Define intent',
          'Discover representations',
          'Compare routes',
          'Simulate + enforce',
          'Select or reject',
        ].map((s, i) => (
          <div key={s}>
            <span>0{i + 1}</span>
            {s}
          </div>
        ))}
      </div>
      <div className="judge-controls">
        <button
          className={
            'button ' + (scenario === 'successful-best-execution' ? 'primary' : 'secondary')
          }
          onClick={() => setScenario('successful-best-execution')}
        >
          1. Best execution
        </button>
        <button
          className={'button ' + (scenario === 'policy-block' ? 'primary' : 'secondary')}
          onClick={() => setScenario('policy-block')}
        >
          2. Policy block
        </button>
        <button
          className={'button ' + (scenario === 'stale-reference' ? 'primary' : 'secondary')}
          onClick={() => setScenario('stale-reference')}
        >
          3. Stale reference
        </button>
        <Link href="/agent#architecture">
          Architecture <ArrowUpRight size={14} />
        </Link>
        <Link href="/system">
          API health <ArrowUpRight size={14} />
        </Link>
        {process.env.NEXT_PUBLIC_GITHUB_URL && (
          <a href={process.env.NEXT_PUBLIC_GITHUB_URL}>
            GitHub <ArrowUpRight size={14} />
          </a>
        )}
      </div>
      {system?.mode === 'live' && (
        <div className="notice">
          Live data mode is active. Scenario fixtures are unavailable; evaluations use actual
          discovered markets.
        </div>
      )}
      <Trade system={system} wallet={wallet} onComplete={onComplete} preset={scenario} />
    </>
  );
}
