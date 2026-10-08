# x402 Lab

A browser-based x402 workshop sandbox for teaching how autonomous agents pay for protected data. The demo models the core flow of an x402 request: a client asks for a resource, the server responds with HTTP 402 Payment Required, the agent checks its wallet and budget, and then it retries with a signed payment header to receive the data.

This is intentionally a simulated environment. No real wallet, no real funds, and no blockchain settlement are involved. It is designed to make the x402 interaction clear and easy to explain in a live session.

## Run

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000.

```sh
npm test
npm run build
```

The production build exports static files to `out/`.

## Workshop flow

- Deploy with the default 1.00 USDC wallet and 0.05 USDC budget. Random prices above the budget are rejected.
- Set the budget to 0.15 USDC to approve every possible price while the wallet has sufficient balance. Deploy, then click **Sign Transaction** to retry and receive data.
- Set the wallet to zero to demonstrate wallet-based rejection.
- Cancel signing or press Escape to stop without moving funds.
- Reset restores both sliders, session counters, and terminals.

Each deployment generates a 0.01–0.15 USDC price, a 24–1024 KB payload, and a UUID-based alphanumeric nonce. Prices and balances use integer cents. Controls are frozen while a run is active, and repeated clicks cannot duplicate deployment or settlement. Timers are cleaned up on unmount. The native dialog provides keyboard focus containment.

The UI uses a simulated `Payment-Signature` header to show the payment flow in a way that is easy to understand in a workshop. It does not implement real cryptographic signing, facilitator verification, or live blockchain settlement. In a real x402 interaction, the agent or wallet would sign automatically; here the user pauses the flow to inspect the request and the decision.

## Session framing

This sandbox is meant to help blockchain club attendees understand:

- what HTTP 402 means in the context of x402
- how a server presents a payment requirement
- how an agent decides whether a request is affordable
- how a signed retry unlocks access to premium data
- why x402 is a lightweight protocol for machine-to-machine payments

The focus is deliberately narrow: x402 as a protocol for paid web access, explained with a safe and teachable simulation.

## Technical workshop format

Use the guided tutorial on the dashboard as a 25–35 minute live exercise. Students can edit the values in `server.js` and `agent.js`, run the simulated exchange, inspect the terminal, and read each request and response in the network panel.

### Suggested run of show

1. Ask students to predict what happens when the client requests `/api/premium-data` without payment.
2. Run the default code and pause at HTTP 402. Identify the server, client, resource, and payment requirement.
3. Open the glossary and explain that x402 defines the payment challenge and retry shape; it does not choose an agent's spending policy.
4. Change `API_PRICE` above `AGENT_MAX_BUDGET`. Run again and observe that the client stops after the challenge and sends no signed retry.
5. Set the budget above the price. Run again and inspect the simulated `PAYMENT-SIGNATURE` retry and HTTP 200 response.
6. Have students answer the checkpoint for each step in their own words.

### Technical accuracy boundary

The tutorial uses the current x402 header concepts: `PAYMENT-REQUIRED` communicates an encoded payment requirement, and `PAYMENT-SIGNATURE` carries the client's payment authorization on the retry. Exact payload fields depend on the configured payment scheme and network. This browser demo uses a fake encoded requirement, fake signature, sandbox values, and fake settlement so it cannot move funds.

Students should leave understanding that:

- HTTP 402 is the server's payment challenge.
- The resource server creates the requirement; the client decides whether its policy permits payment.
- A wallet or signer authorizes the payment, but a facilitator or server-side verifier may validate and settle it in a production deployment.
- HTTP 200 means the resource was served after the payment path was accepted; it does not mean every x402 implementation uses the same asset, network, or payload format.

## Practical workshop scenarios

These are good examples to use during a blockchain club or workshop session. They keep the focus on x402 as a protocol for paid access while making the decisions concrete for students.

### 1. Premium data access

An AI agent asks for a premium dataset or protected API response. The server responds with HTTP 402 and a price. The student controls the wallet and budget, decides whether the agent should pay, and sees whether access is granted.

Learning goal: show how a payment challenge works before data is served.

### 2. AI model inference paywall

The agent requests a large language model or inference endpoint that costs money per call. The client checks whether the request fits within a budget and decides whether the payment is worth it.

Learning goal: explain how x402 can support machine-to-machine payments for AI services and inference calls.

### 3. Market or sensor data stream

A bot wants access to live market data, weather data, or device telemetry. The server charges per response or per subscription-like access. Students see how payment gates can protect high-value data feeds.

Learning goal: show that x402 is useful for real-time data, not only static resources.

### 4. Research archive access

An agent tries to fetch a premium research dataset, academic archive, or proprietary corpus. The request is denied until payment is approved. Students can change wallet limits and test both allowed and denied cases.

Learning goal: demonstrate that payment decisions are policy-driven and budget-sensitive.

### 5. User approval versus autonomous spending

The agent wants to spend a fixed amount, but a human must authorize the payment. Students can compare the same request under different rules: auto-approve, require confirmation, or reject above budget.

Learning goal: teach the difference between an autonomous agent making policy decisions and a user-controlled approval flow.

### 6. Budget exhaustion scenario

A student starts with a small wallet and tries several requests in sequence. One request is affordable, the next exceeds the remaining balance, and the server rejects access. This makes the workshop very hands-on.

Learning goal: show how repeated payments and resource protection work in practice.

### 7. Real-time negotiation challenge

The student manipulates wallet balance and per-request budget while the price changes. Some requests are cheap and allowed; others are above the limit and rejected. This makes the protocol feel like a negotiation between client policy and server requirements.

Learning goal: connect x402 to cost control, policy enforcement, and access decisions.

### Suggested workshop activity

Ask students to try three variations in sequence:

- low budget, low price, success
- low budget, high price, rejection
- sufficient budget and approval, success after retry

Then ask them to explain why the x402 challenge mattered and how the agent decision changed based on policy.

This keeps the session practical and gives students a real interaction to discuss instead of only a conceptual explanation.
