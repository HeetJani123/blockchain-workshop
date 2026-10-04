# x402 Lab

A self-contained Next.js and Tailwind educational payment sandbox. All invoices, signatures, data, and settlement are simulated in the browser; no wallet or backend is required.

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

## Try the flow

- Deploy with the default 1.00 USDC wallet and 0.05 USDC budget. Random prices above the budget are rejected.
- Set the budget to 0.15 USDC to approve every possible price while the wallet has sufficient balance. Deploy, then click **Sign Transaction** to retry and receive data.
- Set the wallet to zero to demonstrate wallet-based rejection.
- Cancel signing or press Escape to stop without moving funds.
- Reset restores both sliders, session counters, and terminals.

Each deployment generates a 0.01–0.15 USDC price, a 24–1024 KB payload, and a UUID-based alphanumeric nonce. Prices and balances use integer cents. Controls are frozen while a run is active, and repeated clicks cannot duplicate deployment or settlement. Timers are cleaned up on unmount. The native dialog provides keyboard focus containment.

The UI uses a simulated `Payment-Signature` header; it does not implement real cryptographic signing, facilitator verification, or blockchain settlement. Real agents can sign automatically; manual signing is an educational pause here.
