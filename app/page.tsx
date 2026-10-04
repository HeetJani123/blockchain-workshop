'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Bot, Check, CheckCheck, ChevronRight, CircleHelp, Code2, Copy, FileJson, FlaskConical, Globe, LoaderCircle, LockKeyhole, Play, Radio, RotateCcw, Server, ShieldCheck, Terminal, Wallet, X, Zap } from 'lucide-react';
import { canAfford, createInvoice, dollars, settle } from '../lib/engine.mjs';

type Log = { text: string; tone: 'info' | 'success' | 'error' | 'muted'; time: string };
type Invoice = { id: string; cents: number; size: number };
type Phase = 'idle' | 'request' | 'challenge' | 'evaluate' | 'wallet' | 'payment' | 'complete' | 'aborted';
const stages = ['Request data', '402 challenge', 'Check limits', 'Sign & pay', 'Receive data'];
const phaseIndex: Record<Phase, number> = { idle: -1, request: 0, challenge: 1, evaluate: 2, wallet: 3, payment: 3, complete: 4, aborted: 2 };

function LogPanel({ kind, logs, busy }: { kind: 'agent' | 'server'; logs: Log[]; busy: boolean }) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' }); }, [logs]);
  return <div className="terminal-box"><div className="terminal-bar"><span><Terminal size={14} />{kind === 'agent' ? 'Agent terminal' : 'Server logs'}</span><span className="terminal-meta"><i className={busy ? 'dot live' : 'dot'} />{busy ? 'LIVE' : 'READY'}</span></div><div ref={scroll} className="terminal-output" role="log" aria-label={`${kind} logs`} aria-live="polite">{logs.length ? logs.map((log, i) => <div className={`log-line ${log.tone}`} key={i}><time>{log.time}</time><span><b>{log.tone === 'error' ? '!' : log.tone === 'success' ? '✓' : '›'}</b>{log.text}</span></div>) : <div className="terminal-empty"><span className="muted">{kind === 'agent' ? '$ agent.init --protocol x402' : '$ server.listen --port 4020'}</span><span>{kind === 'agent' ? 'Agent initialized. Waiting for deployment.' : 'Listening for incoming requests.'}</span><span className="cursor">▋</span></div>}</div><div className="terminal-footer"><span>{kind === 'agent' ? 'agent-01' : 'premium-api'}<span className="dim"> / session output</span></span><span>{logs.length} events</span></div></div>;
}

export default function Sandbox() {
  const [balance, setBalance] = useState(100);
  const [budget, setBudget] = useState(5);
  const [phase, setPhase] = useState<Phase>('idle');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [agentLogs, setAgentLogs] = useState<Log[]>([]);
  const [serverLogs, setServerLogs] = useState<Log[]>([]);
  const [runs, setRuns] = useState(0);
  const [paid, setPaid] = useState(0);
  const [help, setHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = useRef(false);
  const signLock = useRef(false);
  const deployButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const signButton = useRef<HTMLButtonElement>(null);
  const busy = !['idle', 'complete', 'aborted'].includes(phase);
  const active = phaseIndex[phase];
  const snapshot = useRef({ phase, balance, budget, invoice });
  snapshot.current = { phase, balance, budget, invoice };

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: 'read_payment_sandbox', title: 'Read payment sandbox',
        description: 'Read the current simulation phase, wallet and budget in integer cents, and the latest invoice. Does not sign or send a payment.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute(input: unknown) {
          if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object');
          return snapshot.current;
        }
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* The simulation works in browsers without WebMCP support. */ }
    return () => lifecycle.abort();
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (phase === 'wallet') { dialog.current?.showModal(); signButton.current?.focus(); } else if (dialog.current?.open) { dialog.current.close(); deployButton.current?.focus(); } }, [phase]);
  const later = (fn: () => void, delay = 850) => { timer.current = setTimeout(fn, delay); };
  const log = (side: 'agent' | 'server', text: string, tone: Log['tone'] = 'info') => {
    const entry = { text, tone, time: new Date().toLocaleTimeString('en-GB', { hour12: false }) };
    (side === 'agent' ? setAgentLogs : setServerLogs)(previous => [...previous, entry]);
  };
  function deploy() {
    if (locked.current) return;
    locked.current = true; signLock.current = false;
    setAgentLogs([]); setServerLogs([]); setInvoice(null); setCopied(false); setRuns(n => n + 1); setPhase('request');
    log('agent', 'GET /api/premium-data'); log('server', 'Incoming request from agent-01');
    later(() => {
      const request = createInvoice(); setInvoice(request); setPhase('challenge');
      log('server', 'Payment-Signature header not found.', 'muted');
      log('server', `Invoice ${request.id} · ${request.size} KB · $${dollars(request.cents)}`);
      log('server', 'Rejecting: HTTP 402 Payment Required', 'error');
      log('agent', 'HTTP 402 intercepted. Reading payment requirements.', 'error');
      later(() => {
        setPhase('evaluate'); log('agent', `Required: $${dollars(request.cents)} · Budget: $${dollars(budget)} · Wallet: $${dollars(balance)}`);
        later(() => {
          if (!canAfford(request.cents, budget, balance)) {
            log('agent', `ABORT: Required price ($${dollars(request.cents)}) exceeds agent limits.`, 'error');
            log('agent', request.cents > balance ? 'Insufficient wallet balance. No payment made.' : 'Per-request budget exceeded. No payment made.', 'muted');
            setPhase('aborted'); locked.current = false;
          } else {
            log('agent', `Price ($${dollars(request.cents)}) approved. Initiating signature...`, 'success');
            setPhase('wallet');
          }
        });
      });
    });
  }
  function cancel() {
    log('agent', 'Signing cancelled. No funds deducted.', 'muted');
    setPhase('aborted'); locked.current = false;
  }
  function sign() {
    if (!invoice || signLock.current || phase !== 'wallet') return;
    signLock.current = true; setPhase('payment');
    log('agent', 'Simulated payment authorization signed.', 'success');
    log('agent', 'GET /api/premium-data');
    log('agent', `Payment-Signature: sim_${invoice.id}`, 'muted');
    log('server', 'Retry received with Payment-Signature header.');
    later(() => {
      log('server', 'Validating signature...', 'info');
      later(() => {
        const remaining = settle(invoice.cents, budget, balance);
        log('server', 'Success. Returning HTTP 200 OK', 'success');
        log('server', `Delivered ${invoice.size} KB of premium data.`, 'success');
        log('agent', `HTTP 200 OK · ${invoice.size} KB received`, 'success');
        log('agent', `Paid $${dollars(invoice.cents)} USDC. Wallet: $${dollars(remaining)} USDC`, 'success');
        setBalance(remaining); setPaid(n => n + invoice.cents); setPhase('complete'); locked.current = false;
      }, 1000);
    });
  }
  function reset() {
    if (locked.current) return;
    setBalance(100); setBudget(5); setPhase('idle'); setInvoice(null); setAgentLogs([]); setServerLogs([]); setRuns(0); setPaid(0);
  }
  async function copyInvoice() { if (invoice) { try { await navigator.clipboard.writeText(invoice.id); setCopied(true); } catch { setCopied(false); } } }

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="x402 Lab home"><span className="brand-symbol">x</span><span>x402<span className="brand-light">lab</span></span></a><span className="header-divider"/><span className="workspace-label">Protocol sandbox</span><div className="header-right"><span className="simulation-pill"><span className="dot live"/>Simulation mode</span><button className="text-button" onClick={() => setHelp(!help)}><CircleHelp size={15}/>How it works<ArrowUpRight size={13}/></button><a href="https://www.x402.org/" target="_blank" rel="noreferrer" className="docs-link">x402 docs<ArrowUpRight size={14}/></a></div></header>
    <main>
      <div className="page-heading"><div><div className="eyebrow"><FlaskConical size={13}/> THE AGENT ECONOMY, EXPLAINED</div><h1>Small payments. <span>Autonomous agents.</span></h1><p>Give your agent a budget. Watch it request, negotiate, and pay for data.</p></div><span className="environment-tag"><span className="dot live"/> Sandbox environment</span></div>
      {help && <section className="help-panel"><div><h2>One request. A payment conversation.</h2><p>The server responds with HTTP 402 and a price. Your agent checks its wallet and spending limit, then asks you to simulate signing. After the signed retry, the server delivers data and the wallet updates. Real x402 clients can sign automatically; this lab pauses so you can inspect the payment. All signatures, funds, and data here are simulated.</p></div><button aria-label="Close explanation" className="icon-button" onClick={() => setHelp(false)}><X size={18}/></button></section>}
      <section className="flow-strip" aria-label="Payment progress">{stages.map((stage, i) => <div className={`flow-stage ${active === i ? 'current' : ''} ${active > i || phase === 'complete' ? 'finished' : ''} ${phase === 'aborted' && i === 2 ? 'failed' : ''}`} key={stage}><span className="step-number">{active > i || phase === 'complete' ? <Check size={13}/> : `0${i + 1}`}</span><span>{stage}</span>{i < 4 && <ChevronRight className="stage-chevron" size={16}/>}</div>)}</section>

      <div className="dashboard-grid">
        <section className="dashboard-card"><div className="card-heading"><div className="panel-icon agent-icon"><Bot size={22}/></div><div><h2>The AI agent</h2><p>Your autonomous data consumer</p></div><span className="status-badge"><i className={`dot ${busy ? 'live' : ''}`}/>{busy ? 'Active' : 'Ready'}</span></div>
          <div className="configuration"><div className="section-caption"><span>AGENT CONFIGURATION</span><ShieldCheck size={14}/></div>
            <div className="slider-heading"><label htmlFor="wallet"><Wallet size={16}/>Total wallet balance</label><span className="value">{dollars(balance)} <small>USDC</small></span></div>
            <input id="wallet" type="range" min="0" max="500" step="1" value={balance} disabled={busy} onChange={e => setBalance(Number(e.target.value))} style={{ '--fill': `${balance / 5}%` } as React.CSSProperties} aria-valuetext={`${dollars(balance)} USDC`}/><div className="range-labels"><span>0.00 USDC</span><span>5.00 USDC</span></div>
            <div className="slider-heading second-slider"><label htmlFor="budget"><ShieldCheck size={16}/>Max budget per request</label><span className="value">{dollars(budget)} <small>USDC</small></span></div>
            <input id="budget" type="range" min="1" max="15" step="1" value={budget} disabled={busy} onChange={e => setBudget(Number(e.target.value))} style={{ '--fill': `${(budget - 1) / 14 * 100}%` } as React.CSSProperties} aria-valuetext={`${dollars(budget)} USDC`}/><div className="range-labels"><span>0.01 USDC</span><span>0.15 USDC</span></div>
            <div className="budget-note"><LockKeyhole size={13}/><span>Your agent never spends beyond these limits.</span></div>
          </div><LogPanel kind="agent" logs={agentLogs} busy={busy}/>
        </section>

        <section className="dashboard-card"><div className="card-heading"><div className="panel-icon server-icon"><Server size={21}/></div><div><h2>The API server</h2><p>Pay-per-request premium data</p></div><span className="status-badge online"><i className="dot live"/>Online</span></div>
          <div className="server-configuration"><div className="section-caption"><span>SERVER STATUS</span><Radio size={14}/></div><div className="endpoint"><span>GET</span><code>/api/premium-data</code><LockKeyhole size={14}/></div><div className="server-details"><div><span>Payment protocol</span><strong>x402 <span className="mini-label">HTTP</span></strong></div><div><span>Settlement currency</span><strong><span className="usdc-symbol">$</span> USDC <small>Simulated</small></strong></div><div><span>Pricing model</span><strong>Dynamic <span className="price-range">0.01–0.15 USDC</span></strong></div></div><div className="invoice-preview"><div><FileJson size={16}/><span>{invoice ? `${invoice.size} KB payload` : 'A fresh invoice with every request'}</span></div><span>{invoice ? `${dollars(invoice.cents)} USDC` : 'Unique nonce'}<Zap size={12}/></span></div></div>
          <LogPanel kind="server" logs={serverLogs} busy={busy}/>
        </section>
      </div>

      <section className={`action-bar ${phase === 'complete' ? 'is-complete' : ''}`}><div className="action-message"><div className="action-icon">{phase === 'complete' ? <CheckCheck size={21}/> : phase === 'aborted' ? <ShieldCheck size={21}/> : <Zap size={21}/>}</div><div><h3>{phase === 'complete' ? 'Payment settled. Data delivered.' : phase === 'aborted' ? 'Your limits did their job.' : busy ? 'A payment conversation is unfolding…' : 'Ready to meet the paywall?'}</h3><p>{phase === 'complete' ? `$${dollars(invoice?.cents ?? 0)} USDC paid · ${invoice?.size} KB received. Deploy again for a new invoice.` : phase === 'aborted' ? 'No funds moved. Adjust your limits or try a new request.' : busy ? 'Follow both terminals as your agent and the server exchange messages.' : 'Each run generates a new price, payload, and invoice. See what your agent decides.'}</p></div></div><div className="action-buttons"><button className="reset-button" disabled={busy} onClick={reset} aria-label="Reset sandbox" title="Reset sandbox"><RotateCcw size={17}/></button><button ref={deployButton} className="deploy-button" disabled={busy} onClick={deploy}>{busy ? <LoaderCircle size={17} className="animate-spin"/> : <Play size={16} fill="currentColor"/>}{busy ? 'Agent running' : 'Deploy Agent'}{!busy && <ArrowRight size={16}/>}</button></div></section>
      <div className="session-summary"><span><span className="dot live"/> All systems operational</span><div><span>Requests <b>{String(runs).padStart(2, '0')}</b></span><span>Total spent <b>{dollars(paid)} USDC</b></span><span><Globe size={12}/>Local simulation</span></div></div>
      <section className="learning-note"><div className="learning-icon"><Code2 size={21}/></div><div><h3>HTTP 402. Finally put to work.</h3><p>The web has a status code for payments. x402 lets agents use it — no accounts, subscriptions, or API keys.<br className="desktop-break"/> Just a request, a price, and a payment. This sandbox makes that exchange visible.</p></div><span className="code-tag">402 → 200</span></section>
      <footer><span>Built for curious humans and autonomous agents.</span><span><ShieldCheck size={12}/>No real funds. No wallet connection. Just learning.</span></footer>
    </main>
    <dialog ref={dialog} className="wallet-dialog" onCancel={e => { e.preventDefault(); cancel(); }} aria-labelledby="wallet-title"><div className="modal-top"><span className="simulation-pill"><span className="dot live"/>SIMULATED TRANSACTION</span><button className="icon-button" onClick={cancel} aria-label="Cancel signing"><X size={19}/></button></div><div className="wallet-modal-icon"><Wallet size={28}/></div><h2 id="wallet-title">Simulated Wallet</h2><p>Your agent approved this price.<br/>Sign to authorize the payment and unlock the data.</p><div className="payment-amount">{dollars(invoice?.cents ?? 0)}<span>USDC</span></div><div className="payment-details"><div><span>Recipient</span><strong>Premium Data API</strong></div><div><span>Data payload</span><strong>{invoice?.size} KB</strong></div><div className="nonce-row"><span>Invoice ID / nonce</span><button onClick={copyInvoice} title="Copy invoice ID"><code>{invoice?.id}</code>{copied ? <Check size={13}/> : <Copy size={13}/>}</button></div><div><span>Wallet after payment</span><strong>{dollars(balance - (invoice?.cents ?? 0))} USDC</strong></div></div><div className="modal-note"><ShieldCheck size={14}/>Within your ${dollars(budget)} per-request budget</div><button ref={signButton} className="deploy-button sign-button" onClick={sign}><ShieldCheck size={17}/>Sign Transaction<ArrowRight size={16}/></button><button className="cancel-button" onClick={cancel}>Cancel payment</button><div className="modal-disclaimer">Demo signature only. No blockchain transaction is sent.</div></dialog>
  </div>;
}
