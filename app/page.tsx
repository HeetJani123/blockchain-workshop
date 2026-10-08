'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Bot, Check, CheckCheck, ChevronRight, CircleHelp, Code2, Copy, FileJson, FlaskConical, Globe, LoaderCircle, LockKeyhole, Play, Radio, RotateCcw, Server, ShieldCheck, Terminal, Wallet, X, Zap } from 'lucide-react';
import { canAfford, createInvoice, dollars, settle } from '../lib/engine.mjs';

type Log = { text: string; tone: 'info' | 'success' | 'error' | 'muted'; time: string };
type Invoice = { id: string; cents: number; size: number };
type Phase = 'idle' | 'request' | 'challenge' | 'evaluate' | 'wallet' | 'payment' | 'complete' | 'aborted';
type PolicyMode = 'strict' | 'balanced' | 'generous';
type DecisionRecord = { id: string; price: number; balance: number; budget: number; status: 'approved' | 'rejected'; reason: string; time: string; };
const stages = ['Request data', '402 challenge', 'Check limits', 'Sign & pay', 'Receive data'];
const policyModes: PolicyMode[] = ['strict', 'balanced', 'generous'];
const phaseIndex: Record<Phase, number> = { idle: -1, request: 0, challenge: 1, evaluate: 2, wallet: 3, payment: 3, complete: 4, aborted: 2 };

function LogPanel({ kind, logs, busy }: { kind: 'agent' | 'server'; logs: Log[]; busy: boolean }) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' }); }, [logs]);
  return <div className="terminal-box"><div className="terminal-bar"><span><Terminal size={14} />{kind === 'agent' ? 'Agent terminal' : 'Server logs'}</span><span className="terminal-meta"><i className={busy ? 'dot live' : 'dot'} />{busy ? 'LIVE' : 'READY'}</span></div><div ref={scroll} className="terminal-output" role="log" aria-label={`${kind} logs`} aria-live="polite">{logs.length ? logs.map((log, i) => <div className={`log-line ${log.tone}`} key={i}><time>{log.time}</time><span><b>{log.tone === 'error' ? '!' : log.tone === 'success' ? '✓' : '›'}</b>{log.text}</span></div>) : <div className="terminal-empty"><span className="muted">{kind === 'agent' ? '$ agent.init --protocol x402' : '$ server.listen --port 4020'}</span><span>{kind === 'agent' ? 'Agent initialized. Waiting for deployment.' : 'Listening for incoming requests.'}</span><span className="cursor">▋</span></div>}</div><div className="terminal-footer"><span>{kind === 'agent' ? 'agent-01' : 'premium-api'}<span className="dim"> / session output</span></span><span>{logs.length} events</span></div></div>;
}

const tutorialSteps = [
  { title: 'Step 1 — Request premium data', description: 'The client requests a premium resource. Because the resource is protected, the server rejects it with HTTP 402.', question: 'What does the server do before it sends premium data?', options: ['Return HTTP 402 with payment requirements', 'Deduct funds immediately', 'Return HTTP 200'], answer: 0 },
  { title: 'Step 2 — Server challenge', description: 'The server returns a machine-readable payment requirement. In current x402 exchanges, the requirement is carried in the PAYMENT-REQUIRED response header.', question: 'Who creates the payment requirement?', options: ['The resource server', 'The browser history', 'The student after payment'], answer: 0 },
  { title: 'Step 3 — Decode the requirement', description: 'The buyer reads the payment instructions and learns what must be paid, where, and under which scheme or network.', question: 'What should the buyer inspect first?', options: ['Amount, asset, network, and recipient', 'Only the browser title', 'The server password'], answer: 0 },
  { title: 'Step 4 — Apply agent policy', description: 'The agent compares the requested amount with its wallet and spending rules. Your edits to agent.js change this decision.', question: 'When should an agent create a payment?', options: ['Only when its policy allows the requirement', 'For every HTTP request', 'Only after receiving HTTP 200'], answer: 0 },
  { title: 'Step 5 — Sign and retry', description: 'If approved, the buyer creates a payment payload and retries the same resource request with PAYMENT-SIGNATURE.', question: 'What changes on the successful retry?', options: ['The request carries a payment signature', 'The original 402 disappears from history', 'The server skips verification'], answer: 0 },
  { title: 'Step 6 — Verify, settle, deliver', description: 'The server or a facilitator verifies and settles the payment independently. Only then does the server return the protected resource.', question: 'What happens before premium data is delivered?', options: ['The payment is verified and settled', 'The client hides the 402 response', 'The server trusts any header'], answer: 0 }
];

const defaultServerCode = `const API_PRICE = 150;
const ENDPOINT = '/api/premium-data';

app.get(ENDPOINT, (req, res) => {
  if (!req.headers['payment-signature']) {
    return res.status(402).set({
      // x402 sends an encoded payment requirement here.
      'PAYMENT-REQUIRED': encodeRequirement({
        amount: String(API_PRICE),
        asset: 'USDC',
        network: 'sandbox',
        resource: ENDPOINT
      })
    }).json({ error: 'Payment Required' });
  }

  // Production servers verify the payment before serving the resource.
  return res.status(200).json({ data: 'premium-data' });
});`;

const defaultAgentCode = `const AGENT_MAX_BUDGET = 150;
const WALLET = 1000;
const ENDPOINT = '/api/premium-data';

async function fetchData() {
  const response = await fetch(ENDPOINT);

  if (response.status === 402) {
    const requirement = decodeRequirement(
      response.headers.get('payment-required') || ''
    );

    if (Number(requirement.amount) <= AGENT_MAX_BUDGET && Number(requirement.amount) <= WALLET) {
      const signature = await wallet.sign(requirement);
      return fetch(ENDPOINT, {
        headers: { 'PAYMENT-SIGNATURE': signature }
      });
    }
  }

  return response;
}`;

function parseNumericVariable(source: string, name: string) {
  const match = source.match(new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*(\\d+)`));
  return match ? Number(match[1]) : 0;
}

function tutorialTone(line: string) {
  if (/reject|denied|No signed retry|402 Payment Required/.test(line)) return 'tutorial-log-error';
  if (/approve|PAYMENT-SIGNATURE|verified|settled|200 OK|delivered/i.test(line)) return 'tutorial-log-success';
  if (/PAYMENT-REQUIRED|decoded/i.test(line)) return 'tutorial-log-challenge';
  return 'tutorial-log-neutral';
}

function shuffledChoices() {
  return [0, 1, 2].sort(() => Math.random() - 0.5);
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
  const [policyMode, setPolicyMode] = useState<PolicyMode>('balanced');
  const [history, setHistory] = useState<DecisionRecord[]>([]);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialTab, setTutorialTab] = useState<'server' | 'agent'>('server');
  const [serverCode, setServerCode] = useState(defaultServerCode);
  const [agentCode, setAgentCode] = useState(defaultAgentCode);
  const [tutorialLogs, setTutorialLogs] = useState<string[]>(['$ server.ready', '$ agent.ready']);
  const [tutorialNetwork, setTutorialNetwork] = useState<Array<{ id: string; kind: 'request' | 'response'; label: string; status: number | null; headers: Record<string, string> }>>([]);
  const [tutorialRunning, setTutorialRunning] = useState(false);
  const [choiceOrder, setChoiceOrder] = useState<number[]>(shuffledChoices);
  const [miniResource, setMiniResource] = useState('my-premium-data');
  const [miniPrice, setMiniPrice] = useState(5);
  const [checkpointAnswer, setCheckpointAnswer] = useState<number | null>(null);
  const [checkpointChecked, setCheckpointChecked] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = useRef(false);
  const signLock = useRef(false);
  const deployButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const signButton = useRef<HTMLButtonElement>(null);
  const busy = !['idle', 'complete', 'aborted'].includes(phase);
  const active = phaseIndex[phase];
  const affordabilityText = invoice ? (canAfford(invoice.cents, budget, balance, policyMode) ? 'Affordable and within policy' : 'Blocked by budget or wallet limits') : 'Waiting for a new request';
  const policyLabel: Record<PolicyMode, string> = { strict: 'Strict', balanced: 'Balanced', generous: 'Generous' };
  const comparePolicies = policyModes.map((mode) => {
    const effectiveLimit = mode === 'strict' ? budget * 0.8 : mode === 'generous' ? budget * 1.15 : budget;
    const price = invoice?.cents ?? 0;
    const approved = invoice ? canAfford(price, budget, balance, mode) : false;
    const reason = !invoice
      ? 'No active request'
      : price > balance
        ? 'Wallet too low'
        : price > effectiveLimit
          ? 'Policy limit exceeded'
          : 'Allowed by policy';
    return { mode, label: policyLabel[mode], approved, effectiveLimit, reason, price };
  });
  const policyLimit = policyMode === 'strict' ? budget * 0.8 : policyMode === 'generous' ? budget * 1.15 : budget;
  const snapshot = useRef({ phase, balance, budget, invoice });
  snapshot.current = { phase, balance, budget, invoice };
  const currentTutorialStep = tutorialSteps[tutorialStep];
  const selectedAnswer = checkpointAnswer === null ? null : choiceOrder[checkpointAnswer];

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
  useEffect(() => {
    setChoiceOrder(shuffledChoices());
    setCheckpointAnswer(null);
    setCheckpointChecked(false);
  }, [tutorialStep]);
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
        setPhase('evaluate'); log('agent', `Required: $${dollars(request.cents)} · Budget: $${dollars(budget)} · Wallet: $${dollars(balance)} · Policy: ${policyLabel[policyMode]}`);
        later(() => {
          const allowed = canAfford(request.cents, budget, balance, policyMode);
          const reason = request.cents > balance
            ? 'Wallet balance is too low.'
            : request.cents > policyLimit
              ? `The request exceeds the ${policyLabel[policyMode].toLowerCase()} policy limit.`
              : 'The request is within the wallet and budget policy.';
          if (!allowed) {
            log('agent', `ABORT: Required price ($${dollars(request.cents)}) exceeds agent limits.`, 'error');
            log('agent', reason, 'muted');
            setHistory((previous): DecisionRecord[] => [{ id: `${Date.now()}-reject`, price: request.cents, balance, budget, status: 'rejected' as const, reason, time: new Date().toLocaleTimeString('en-GB', { hour12: false }) }, ...previous].slice(0, 6));
            setPhase('aborted'); locked.current = false;
          } else {
            log('agent', `Price ($${dollars(request.cents)}) approved. Initiating signature...`, 'success');
            setHistory((previous): DecisionRecord[] => [{ id: `${Date.now()}-approve`, price: request.cents, balance, budget, status: 'approved' as const, reason, time: new Date().toLocaleTimeString('en-GB', { hour12: false }) }, ...previous].slice(0, 6));
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
    setBalance(100); setBudget(5); setPhase('idle'); setInvoice(null); setAgentLogs([]); setServerLogs([]); setRuns(0); setPaid(0); setHistory([]);
  }
  function runTutorial() {
    const apiPrice = parseNumericVariable(serverCode, 'API_PRICE');
    const budget = parseNumericVariable(agentCode, 'AGENT_MAX_BUDGET');
    const wallet = parseNumericVariable(agentCode, 'WALLET');
    const nonce = `nonce_${Math.random().toString(36).slice(2, 9)}`;
    const requestHeaders = { Accept: 'application/json', Connection: 'keep-alive' };
    const requirement = btoa(JSON.stringify({ amount: String(apiPrice), asset: 'USDC', network: 'sandbox', resource: '/api/premium-data', nonce }));
    const challengeHeaders = { 'PAYMENT-REQUIRED': requirement };
    const signature = `sim_${nonce}`;

    setTutorialRunning(true);
    setTutorialLogs(['$ curl /api/premium-data', '> GET /api/premium-data HTTP/1.1', '> Accept: application/json']);
    setTutorialNetwork([]);

    const queue: Array<{ id: string; label: string; kind: 'request' | 'response'; status: number | null; headers: Record<string, string> }> = [
      { id: 'req-1', label: 'Request', kind: 'request', status: null, headers: requestHeaders },
      { id: 'res-1', label: '402 Response', kind: 'response', status: 402, headers: challengeHeaders },
      { id: 'policy-1', label: 'Decoded requirement', kind: 'response', status: null, headers: { 'Decision': apiPrice <= budget && apiPrice <= wallet ? 'approve' : 'reject', 'Amount': String(apiPrice), 'Nonce': nonce, 'Wallet': String(wallet), 'Budget': String(budget) } },
      { id: 'req-2', label: 'Retry with signature', kind: 'request', status: null, headers: { 'PAYMENT-SIGNATURE': signature } },
      { id: 'res-2', label: '200 Response', kind: 'response', status: 200, headers: { 'PAYMENT-RESPONSE': 'simulated-settlement', 'Content-Type': 'application/json' } }
    ];

    const events = [
      '$ curl /api/premium-data',
      '> GET /api/premium-data HTTP/1.1',
      '> Accept: application/json',
      '< HTTP/1.1 402 Payment Required',
      `< PAYMENT-REQUIRED: ${requirement.slice(0, 24)}… (base64 requirement)`,
      `< decoded nonce: ${nonce}`,
      '> Agent checks wallet and max budget',
      apiPrice <= budget && apiPrice <= wallet ? '> Decision: approve request' : '> Decision: reject request',
      apiPrice <= budget && apiPrice <= wallet ? '> PAYMENT-SIGNATURE: sim_' + nonce : '> No signed retry sent',
      apiPrice <= budget && apiPrice <= wallet ? '< Facilitator: payment verified' : '< Verification skipped: policy rejected',
      apiPrice <= budget && apiPrice <= wallet ? '< Facilitator: payment settled' : '< HTTP/1.1 402 Payment Required',
      apiPrice <= budget && apiPrice <= wallet ? '< HTTP/1.1 200 OK' : '> Access denied by policy',
      apiPrice <= budget && apiPrice <= wallet ? '> Data delivered successfully' : '> No resource returned'
    ];

    const timers = events.map((event, index) => setTimeout(() => {
      setTutorialLogs((previous) => [...previous, event]);
      if (index >= 3 && index < 5) setTutorialStep(1);
      if (index === 5) setTutorialStep(2);
      if (index >= 6 && index < 8) setTutorialStep(3);
      if (index === 8) setTutorialStep(4);
      if (index >= 9) setTutorialStep(5);
      if (index < queue.length) {
        setTutorialNetwork((previous) => [...previous, { ...queue[index] }]);
      }
      if (index === events.length - 1) setTutorialRunning(false);
    }, index * 800));

    return () => timers.forEach(clearTimeout);
  }
  function runMiniChallenge() {
    if (tutorialRunning) return;
    const resource = miniResource.trim() || 'my-premium-data';
    const price = Math.max(1, Math.min(150, miniPrice));
    const allowed = price <= budget && price <= balance;
    const nonce = `mini_${Math.random().toString(36).slice(2, 8)}`;
    setTutorialRunning(true);
    setTutorialLogs([`$ GET /${resource}`, '> Request has no payment signature']);
    setTutorialNetwork([]);
    const events = [
      `> GET /${resource} HTTP/1.1`,
      '< HTTP/1.1 402 Payment Required',
      `< PAYMENT-REQUIRED: price=${price}¢ resource=/${resource}`,
      `> Policy check: budget=${budget}¢ wallet=${balance}¢`,
      allowed ? '> Decision: approve and create payment' : '> Decision: reject request',
      allowed ? `> PAYMENT-SIGNATURE: sim_${nonce}` : '> No signed retry sent',
      allowed ? '< HTTP/1.1 200 OK' : '< Request ended at HTTP 402',
      allowed ? `> Delivered /${resource}` : '> Resource remains locked'
    ];
    events.forEach((event, index) => setTimeout(() => {
      setTutorialLogs((previous) => [...previous, event]);
      if (index === events.length - 1) setTutorialRunning(false);
    }, (index + 1) * 650));
  }
  async function copyInvoice() { if (invoice) { try { await navigator.clipboard.writeText(invoice.id); setCopied(true); } catch { setCopied(false); } } }

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="x402 Lab home"><span className="brand-symbol">x</span><span>x402<span className="brand-light">lab</span></span></a><span className="header-divider"/><span className="workspace-label">Protocol sandbox</span><div className="header-right"><span className="simulation-pill"><span className="dot live"/>Simulation mode</span><button className="text-button" onClick={() => setHelp(!help)}><CircleHelp size={15}/>How it works<ArrowUpRight size={13}/></button><a href="https://www.x402.org/" target="_blank" rel="noreferrer" className="docs-link">x402 docs<ArrowUpRight size={14}/></a></div></header>
    <main>
      <section className="workshop-hero">
        <div className="hero-copy">
          <div className="eyebrow"><FlaskConical size={13}/> WORKSHOP / 01</div>
          <h1>Understand the <span>x402 handshake.</span></h1>
          <p>Trace how an agent requests a protected resource, reads a payment challenge, decides whether to pay, and retries with proof.</p>
        </div>
        <div className="prereq-panel">
          <div className="prereq-label">Before you begin</div>
          <div className="prereq-list"><span><Check size={13}/>HTTP request basics</span><span><Check size={13}/>A spending limit to test</span><span><Check size={13}/>No wallet or funds needed</span></div>
        </div>
      </section>
      <section className="protocol-brief">
        <div className="brief-heading"><span className="eyebrow"><Globe size={13}/> THE PROTOCOL MAP</span><span className="brief-source">Based on the x402 documentation</span></div>
        <div className="brief-grid">
          <article><span className="brief-number">01</span><h2>HTTP is the trigger</h2><p>A normal request reaches a protected endpoint. The server uses HTTP 402 to say payment is required.</p></article>
          <article><span className="brief-number">02</span><h2>Requirements are data</h2><p>The response carries machine-readable payment instructions, so a client can decide without a human checkout.</p></article>
          <article><span className="brief-number">03</span><h2>Verification gates access</h2><p>The server or facilitator verifies and settles the payment before returning the resource.</p></article>
        </div>
      </section>
      <div className="page-heading legacy-surface"><div><div className="eyebrow"><FlaskConical size={13}/> X402 IN MOTION</div><h1>Request. Challenge. <span>Approve. Receive.</span></h1><p>An AI client asks for premium data, the server returns HTTP 402, and the agent decides whether the payment is allowed before retrying.</p></div><span className="environment-tag"><span className="dot live"/> Protocol sandbox</span></div>
        <div className="learning-note legacy-surface" style={{ marginTop: '1rem' }}><div className="learning-icon"><ArrowRight size={21}/></div><div><h3>x402 flow</h3><p>Request → 402 challenge → check wallet and budget → approve payment → retry with Payment-Signature → receive data.</p></div><span className="code-tag">HTTP 402</span></div>
      {help && <section className="help-panel"><div><h2>How the x402 exchange works.</h2><p>The client asks for a protected resource. The server responds with HTTP 402 and a price. The agent evaluates whether the request is affordable, then asks the user to approve the payment. After the signed retry, the server validates the payment and returns the data. This sandbox keeps the protocol realistic while simulating the wallet, signature, and settlement steps.</p></div><button aria-label="Close explanation" className="icon-button" onClick={() => setHelp(false)}><X size={18}/></button></section>}
      <section className="flow-strip" aria-label="Payment progress">{stages.map((stage, i) => <div className={`flow-stage ${active === i ? 'current' : ''} ${active > i || phase === 'complete' ? 'finished' : ''} ${phase === 'aborted' && i === 2 ? 'failed' : ''}`} key={stage}><span className="step-number">{active > i || phase === 'complete' ? <Check size={13}/> : `0${i + 1}`}</span><span>{stage}</span>{i < 4 && <ChevronRight className="stage-chevron" size={16}/>}</div>)}</section>

      <div className="dashboard-grid legacy-surface">
        <section className="dashboard-card"><div className="card-heading"><div className="panel-icon agent-icon"><Bot size={22}/></div><div><h2>The AI agent</h2><p>Your autonomous data consumer</p></div><span className="status-badge"><i className={`dot ${busy ? 'live' : ''}`}/>{busy ? 'Active' : 'Ready'}</span></div>
          <div className="configuration"><div className="section-caption"><span>AGENT POLICY</span><ShieldCheck size={14}/></div>
            <div className="slider-heading"><label htmlFor="wallet"><Wallet size={16}/>Wallet balance</label><span className="value">{dollars(balance)} <small>USDC</small></span></div>
            <input id="wallet" type="range" min="0" max="500" step="1" value={balance} disabled={busy} onChange={e => setBalance(Number(e.target.value))} style={{ '--fill': `${balance / 5}%` } as React.CSSProperties} aria-valuetext={`${dollars(balance)} USDC`}/><div className="range-labels"><span>0.00 USDC</span><span>5.00 USDC</span></div>
            <div className="slider-heading second-slider"><label htmlFor="budget"><ShieldCheck size={16}/>Per-request budget</label><span className="value">{dollars(budget)} <small>USDC</small></span></div>
            <input id="budget" type="range" min="1" max="15" step="1" value={budget} disabled={busy} onChange={e => setBudget(Number(e.target.value))} style={{ '--fill': `${(budget - 1) / 14 * 100}%` } as React.CSSProperties} aria-valuetext={`${dollars(budget)} USDC`}/><div className="range-labels"><span>0.01 USDC</span><span>0.15 USDC</span></div>
            <div className="budget-note"><LockKeyhole size={13}/><span>The agent only pays if the request is within policy.</span></div>
          </div><LogPanel kind="agent" logs={agentLogs} busy={busy}/>
        </section>

        <section className="dashboard-card"><div className="card-heading"><div className="panel-icon server-icon"><Server size={21}/></div><div><h2>The API server</h2><p>Pay-per-request premium data</p></div><span className="status-badge online"><i className="dot live"/>Online</span></div>
          <div className="server-configuration"><div className="section-caption"><span>SERVER STATUS</span><Radio size={14}/></div><div className="endpoint"><span>GET</span><code>/api/premium-data</code><LockKeyhole size={14}/></div><div className="server-details"><div><span>Payment protocol</span><strong>x402 <span className="mini-label">HTTP</span></strong></div><div><span>Settlement currency</span><strong><span className="usdc-symbol">$</span> USDC <small>Simulated</small></strong></div><div><span>Pricing model</span><strong>Dynamic <span className="price-range">0.01–0.15 USDC</span></strong></div></div><div className="invoice-preview"><div><FileJson size={16}/><span>{invoice ? `${invoice.size} KB payload` : 'A fresh invoice with every request'}</span></div><span>{invoice ? `${dollars(invoice.cents)} USDC` : 'Unique nonce'}<Zap size={12}/></span></div></div>
          <LogPanel kind="server" logs={serverLogs} busy={busy}/>
        </section>
      </div>

      <section style={{ marginTop: 30, padding: '18px 20px', border: '1px solid #283033', borderRadius: 16, background: '#12191b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: '#c5f277', fontWeight: 700, textTransform: 'uppercase' }}>Technical workshop</div>
            <h2 style={{ margin: '8px 0 6px', fontSize: 22 }}>By the end, students can trace an x402 payment</h2>
            <p style={{ margin: 0, color: '#b5bec1', lineHeight: 1.6 }}>Read the HTTP exchange, identify the payment requirement, explain the agent decision, and distinguish a simulated signature from real wallet and settlement infrastructure.</p>
          </div>
          <button onClick={() => setGlossaryOpen((previous) => !previous)} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #2b3437', background: '#111819', color: '#dfe7e3' }}>{glossaryOpen ? 'Hide glossary' : 'Open glossary'}</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 16 }}>
          {['HTTP 402 is the challenge', 'Payment requirement is machine-readable', 'Agent policy is separate from x402', 'Verification happens before delivery'].map((objective) => <div key={objective} style={{ padding: 11, borderRadius: 10, border: '1px solid #283033', color: '#dfe7e3', fontSize: 12 }}>✓ {objective}</div>)}
        </div>
        {glossaryOpen && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14, paddingTop: 14, borderTop: '1px solid #283033' }}>
          <div><strong style={{ color: '#c5f277' }}>Resource server</strong><p style={{ color: '#aeb8bb', lineHeight: 1.5 }}>Owns the protected endpoint, creates the payment requirement, and decides whether to serve the resource.</p></div>
          <div><strong style={{ color: '#c5f277' }}>Client / agent</strong><p style={{ color: '#aeb8bb', lineHeight: 1.5 }}>Reads the challenge, applies local spending policy, obtains payment authorization, and retries.</p></div>
          <div><strong style={{ color: '#c5f277' }}>Facilitator</strong><p style={{ color: '#aeb8bb', lineHeight: 1.5 }}>A production component that can verify payment and help settle it on the configured network.</p></div>
          <div><strong style={{ color: '#c5f277' }}>Simulation boundary</strong><p style={{ color: '#aeb8bb', lineHeight: 1.5 }}>This page fakes the wallet, signature, verification, and settlement. It demonstrates the protocol shape, not a live payment.</p></div>
        </div>}
      </section>

      <section className="tutorial-shell" style={{ marginTop: 30, border: '1px solid #283033', borderRadius: 18, background: '#0f1517', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 18px', borderBottom: '1px solid #273236', background: '#121b1d' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: '#c5f277', fontWeight: 700, textTransform: 'uppercase' }}>Guided tutorial</div>
            <h2 style={{ margin: '8px 0 0', fontSize: 24, letterSpacing: '-0.8px' }}>x402 handshake walkthrough</h2>
            <p className="tutorial-instruction">Edit <code>API_PRICE</code>, <code>AGENT_MAX_BUDGET</code>, or <code>WALLET</code>, then run the exchange and compare the result.</p>
          </div>
          <button onClick={runTutorial} disabled={tutorialRunning} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #c5f277', background: tutorialRunning ? '#202b20' : '#182018', color: '#c5f277', fontWeight: 700 }}>
            {tutorialRunning ? 'Running…' : 'Run'}
          </button>
        </div>
        <div style={{ display: 'flex', minHeight: 520, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px', minWidth: 240, borderRight: '1px solid #283033', background: '#101517' }}>
            <div style={{ padding: 18 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, color: '#bfe76e', fontWeight: 700, textTransform: 'uppercase' }}>Step {tutorialStep + 1} of {tutorialSteps.length}</div>
              <h3 style={{ margin: '12px 0 10px', fontSize: 20 }}>{tutorialSteps[tutorialStep].title}</h3>
              <p style={{ color: '#b5bec1', lineHeight: 1.7, margin: 0 }}>{tutorialSteps[tutorialStep].description}</p>
              <div style={{ marginTop: 18, padding: 12, borderRadius: 12, background: '#111819', border: '1px solid #283033' }}>
                <strong style={{ color: '#c5f277', fontSize: 11 }}>Checkpoint</strong>
                <p style={{ color: '#dfe7e3', lineHeight: 1.5, fontSize: 12, margin: '8px 0 10px' }}>{currentTutorialStep.question}</p>
                <div style={{ display: 'grid', gap: 7 }}>
                  {choiceOrder.map((optionIndex, index) => <button key={currentTutorialStep.options[optionIndex]} onClick={() => { setCheckpointAnswer(index); setCheckpointChecked(false); }} style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: checkpointAnswer === index ? '1px solid #c5f277' : '1px solid #2b3437', background: checkpointAnswer === index ? '#182018' : '#101517', color: '#dfe7e3', fontSize: 11 }}>{String.fromCharCode(65 + index)}. {currentTutorialStep.options[optionIndex]}</button>)}
                </div>
                <button onClick={() => setCheckpointChecked(true)} disabled={checkpointAnswer === null} style={{ marginTop: 10, padding: '8px 11px', borderRadius: 8, border: '1px solid #c5f277', background: '#182018', color: '#c5f277', fontWeight: 700, fontSize: 11 }}>Check answer</button>
                {checkpointChecked && <div style={{ marginTop: 9, color: selectedAnswer === currentTutorialStep.answer ? '#c5f277' : '#fca5a5', fontSize: 11 }}>{selectedAnswer === currentTutorialStep.answer ? 'Correct. Explain this before moving to the next step.' : 'Not quite. Re-read the step and inspect the network panel.'}</div>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22, gap: 12 }}>
                <button onClick={() => { setTutorialStep((previous) => Math.max(0, previous - 1)); setChoiceOrder(shuffledChoices()); setCheckpointAnswer(null); setCheckpointChecked(false); }} disabled={tutorialStep === 0} style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #2b3437', background: '#111819', color: '#edf0ee' }}>Previous</button>
                <button onClick={() => { setTutorialStep((previous) => Math.min(tutorialSteps.length - 1, previous + 1)); setChoiceOrder(shuffledChoices()); setCheckpointAnswer(null); setCheckpointChecked(false); }} disabled={tutorialStep === tutorialSteps.length - 1} style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #c5f277', background: '#182018', color: '#c5f277', fontWeight: 700 }}>Next</button>
              </div>
            </div>
          </div>
          <div style={{ flex: '1.4 1 420px', minWidth: 240, borderRight: '1px solid #283033', background: '#0f1517' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #283033' }}>
              {(['server', 'agent'] as const).map((tab) => (
                <button key={tab} onClick={() => setTutorialTab(tab)} style={{ flex: 1, padding: '12px 14px', border: '0', borderBottom: tutorialTab === tab ? '2px solid #c5f277' : '0', background: tutorialTab === tab ? '#111819' : '#0e1415', color: tutorialTab === tab ? '#c5f277' : '#dfe7e3', fontWeight: 700 }}>
                  {tab === 'server' ? 'server.js' : 'agent.js'}
                </button>
              ))}
            </div>
            <textarea value={tutorialTab === 'server' ? serverCode : agentCode} onChange={(event) => tutorialTab === 'server' ? setServerCode(event.target.value) : setAgentCode(event.target.value)} style={{ width: '100%', minHeight: 418, resize: 'vertical', border: 0, background: '#111819', color: '#eaf2f0', fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: 12, lineHeight: 1.7, padding: 16 }} spellCheck={false} />
          </div>
          <div style={{ flex: '1.1 1 320px', minWidth: 240, background: '#0d1214' }}>
            <div style={{ borderBottom: '1px solid #283033', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 10, letterSpacing: 1.4, color: '#c5f277', fontWeight: 700, textTransform: 'uppercase' }}>Terminal</div>
              <div style={{ fontSize: 11, color: '#aab3b7' }}>{tutorialRunning ? 'Live' : 'Ready'}</div>
            </div>
            <div className="tutorial-terminal-output">
              {tutorialLogs.map((line, index) => <div className={`tutorial-log-line ${tutorialTone(line)}`} key={index}><span className="tutorial-log-marker">{line.startsWith('<') ? '←' : line.startsWith('>') ? '→' : '·'}</span>{line}</div>)}
            </div>
            <div style={{ borderTop: '1px solid #283033', borderBottom: '1px solid #283033', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 10, letterSpacing: 1.4, color: '#c5f277', fontWeight: 700, textTransform: 'uppercase' }}>Network inspector</div>
              <div style={{ fontSize: 11, color: '#aab3b7' }}>Request / Response</div>
            </div>
            <div style={{ padding: 12, display: 'grid', gap: 10, maxHeight: 220, overflow: 'auto' }}>
              {tutorialNetwork.length ? tutorialNetwork.map((entry) => (
                <div key={entry.id} style={{ border: '1px solid #263235', borderRadius: 10, background: '#111819', padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ color: '#edf0ee', fontSize: 12 }}>{entry.label}</strong>
                    <span style={{ color: entry.status && entry.status >= 400 ? '#fca5a5' : '#c5f277', fontSize: 10, fontWeight: 700 }}>{entry.status ? `HTTP ${entry.status}` : 'PREP'}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 4, fontSize: 11, color: '#b9c0c5' }}>
                    {Object.entries(entry.headers).map(([key, value]) => (
                      <div key={key}><span style={{ color: '#c5f277' }}>{key}:</span> {value}</div>
                    ))}
                  </div>
                </div>
              )) : <div style={{ color: '#8f9ca0', fontSize: 12 }}>Run the handshake to inspect the request and response headers.</div>}
            </div>
          </div>
        </div>
      </section>
      <section className="build-section">
        <div className="build-heading">
          <div><span className="eyebrow"><Code2 size={13}/> MAKE A TINY ENDPOINT</span><h2>Build your own payment gate.</h2><p>Change the resource and price, then request it. The workshop simulates the full 402 exchange right here.</p></div>
        </div>
        <div className="mini-builder">
          <label><span>Resource name</span><input value={miniResource} onChange={(event) => setMiniResource(event.target.value.replace(/[^a-zA-Z0-9-_]/g, '-'))} placeholder="my-premium-data" /></label>
          <label><span>Price in cents</span><input type="number" min="1" max="150" value={miniPrice} onChange={(event) => setMiniPrice(Number(event.target.value) || 1)} /></label>
          <button className="build-run-button" onClick={runMiniChallenge} disabled={tutorialRunning}><Play size={15}/>{tutorialRunning ? 'Requesting...' : 'Request resource'}</button>
        </div>
        <div className="build-note"><ShieldCheck size={16}/><span>Nothing leaves this browser. Your request is simulated, so students can safely test both approved and rejected prices.</span></div>
      </section>
      <div className="session-summary" style={{ marginTop: 18 }}><span><span className="dot live"/> Agent policy: {policyLabel[policyMode]}</span><div><span>Wallet <b>{dollars(balance)} USDC</b></span><span>Budget <b>{dollars(budget)} USDC</b></span><span>Decision <b>{affordabilityText}</b></span><span><Globe size={12}/>Local simulation</span></div></div>
      <section style={{ marginTop: 18, padding: '16px 14px 10px', border: '1px solid #283033', borderRadius: 14, background: '#101517' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.4, color: '#c5f277', textTransform: 'uppercase', fontWeight: 700 }}>Policy comparison</div>
          <div style={{ color: '#aab3b7', fontSize: 11 }}>Current request: {invoice ? `$${dollars(invoice.cents)}` : 'n/a'}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {comparePolicies.map(({ mode, label, approved, effectiveLimit, reason, price }) => (
            <div key={mode} style={{ border: mode === policyMode ? '1px solid #c5f277' : '1px solid #2b3437', borderRadius: 12, padding: 12, background: mode === policyMode ? '#182019' : '#111819' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <strong style={{ color: '#edf0ee', fontSize: 13 }}>{label}</strong>
                <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: approved ? '#1d3a2a' : '#4a2626', color: approved ? '#c5f277' : '#fca5a5' }}>{approved ? 'ALLOW' : 'BLOCK'}</span>
              </div>
              <div style={{ marginTop: 10, color: '#b3bbc0', fontSize: 11, lineHeight: 1.65 }}>
                Limit: ${dollars(effectiveLimit || 0)}<br />
                Price: ${dollars(price || 0)}<br />
                Result: {reason}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section style={{ marginTop: 18, padding: '16px 14px 10px', border: '1px solid #283033', borderRadius: 14, background: '#101517' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.4, color: '#c5f277', textTransform: 'uppercase', fontWeight: 700 }}>Recent decisions</div>
          <div style={{ color: '#aab3b7', fontSize: 11 }}>Policy limit: {dollars(policyLimit)} USDC</div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {history.length ? history.map((entry) => (
            <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 10, border: '1px solid #233033', background: entry.status === 'approved' ? '#122018' : '#201616' }}>
              <span style={{ borderRadius: 999, minWidth: 56, textAlign: 'center', padding: '4px 8px', fontSize: 10, fontWeight: 700, background: entry.status === 'approved' ? '#1d3a2a' : '#4a2626', color: entry.status === 'approved' ? '#c5f277' : '#fca5a5' }}>{entry.status === 'approved' ? 'APPROVED' : 'REJECTED'}</span>
              <div>
                <div style={{ color: '#edf0ee', fontSize: 12, fontWeight: 600 }}>${dollars(entry.price)} · {entry.reason}</div>
                <div style={{ color: '#9aa7aa', fontSize: 10 }}>Wallet {dollars(entry.balance)} · Budget {dollars(entry.budget)} · {entry.time}</div>
              </div>
              <span style={{ color: '#b1babd', fontSize: 10 }}>{entry.status === 'approved' ? 'paid' : 'blocked'}</span>
            </div>
          )) : (
            <div style={{ color: '#8f9ca0', fontSize: 12, padding: '10px 6px' }}>No decisions yet. Run a request to see how the agent evaluates each challenge.</div>
          )}
        </div>
      </section>
      <section className="learning-note"><div className="learning-icon"><Code2 size={21}/></div><div><h3>HTTP 402 is the payment gate.</h3><p>When a protected resource is requested, the server can require payment before the client continues. x402 turns that into a structured flow: challenge, evaluate, approve, retry with a signed payment header, and then receive the data.<br className="desktop-break"/> This sandbox makes the protocol visible without real settlement or real wallet integration.</p></div><span className="code-tag">402 → 200</span></section>
      <footer><span>Built to explain x402 clearly.</span><span><ShieldCheck size={12}/>No real funds. No wallet connection. Just learning.</span></footer>
    </main>
    <dialog ref={dialog} className="wallet-dialog" onCancel={e => { e.preventDefault(); cancel(); }} aria-labelledby="wallet-title"><div className="modal-top"><span className="simulation-pill"><span className="dot live"/>SIMULATED TRANSACTION</span><button className="icon-button" onClick={cancel} aria-label="Cancel signing"><X size={19}/></button></div><div className="wallet-modal-icon"><Wallet size={28}/></div><h2 id="wallet-title">Simulated Wallet</h2><p>The agent has checked the request and approved the price.<br/>Approve the payment to retry with the signed header and unlock the data.</p><div className="payment-amount">{dollars(invoice?.cents ?? 0)}<span>USDC</span></div><div className="payment-details"><div><span>Recipient</span><strong>Premium Data API</strong></div><div><span>Data payload</span><strong>{invoice?.size} KB</strong></div><div className="nonce-row"><span>Invoice ID / nonce</span><button onClick={copyInvoice} title="Copy invoice ID"><code>{invoice?.id}</code>{copied ? <Check size={13}/> : <Copy size={13}/>}</button></div><div><span>Wallet after payment</span><strong>{dollars(balance - (invoice?.cents ?? 0))} USDC</strong></div></div><div className="modal-note"><ShieldCheck size={14}/>Within the current ${dollars(budget)} per-request policy</div><button ref={signButton} className="deploy-button sign-button" onClick={sign}><ShieldCheck size={17}/>Approve payment & retry<ArrowRight size={16}/></button><button className="cancel-button" onClick={cancel}>Cancel payment</button><div className="modal-disclaimer">Demo signature only. No blockchain transaction is sent.</div></dialog>
  </div>;
}
