# Hustle Market

Live: https://hustle-market.vercel.app

A plain JavaScript stall directory and order dashboard for the SST hustle event at Uniworld 1 and 2. No frontend packages or build step. Serve this directory with any static HTTP server.

## Data and payments

The public catalog comes from the Google Apps Script endpoint configured in `data.json`. Customer details, order actions, stall access codes and listing/payment proofs are submitted to that backend. Payments happen in the recipient's UPI app, not on this website. A browser display does not confirm settlement.

This repository does not include the Apps Script backend. Server authorization, price validation, deduplication/idempotency, rate limits, retention and payment-proof access are not audited by this client review. They must be checked against the deployed backend source before claiming end-to-end security.

## Failure behavior

Requests time out after 20 seconds, check HTTP status and reject oversized response text. Mutations are never automatically retried: a lost response can still mean the server committed the action. Check status before resubmitting. Cached catalogs are view-only until a live fetch succeeds. Ordering requires a live catalog no older than 60 seconds, checked again at submission. The backend must independently validate current prices, stock and authorization.

Restricted browser storage falls back to this tab's memory with a visible warning. Save order references elsewhere. Avoid shared devices for stall sign-in, sign out afterward, and never share access codes. Keep all customer details and payment screenshots private.

The existing noindex policy is intentional: this is a campus event service with personal and financial workflows, not a public demo dataset. No fake stalls or orders are added by the client audit. Do not run tests against real order, signup, proof or approval endpoints; mock these locally.
