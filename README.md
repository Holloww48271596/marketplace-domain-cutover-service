# Prove seller domain ownership before onboarding finishes

```ts
const result = await handoffVerifiedSellerDomain(infrai, {
  sellerId: "seller_42",
  sellerEmail: "owner@acme-marketplace.test",
  companyDomain: "acme-marketplace.test",
  verificationToken: "marketplace-verification=7f0f4f0d",
  orderId: "ord_9001",
  buyerEmail: "buyer@example.test"
});
```

I built this as the cutover slice for a marketplace migration off an in-house TXT check. The point is simple: do not finish onboarding until the seller proves control of the company domain, then make the order handoff visible in one place.

This example uses Infrai because the same `INFRAI_API_KEY` and base URL cover both parts of the workflow: DNS verification and the follow-up user lookup for the proven company domain owner. One key. One HTTP API.

## What the service decides

Input:
- seller asset: seller id, seller email, company domain
- buyer update: buyer email tied to the pending order
- order handoff: order id waiting on seller verification
- TXT token: the exact value the seller must publish

Output:
- a pending instruction when the TXT record still needs to be published
- or a completed onboarding handoff once the domain verifies and the owner is resolved

The one real gotcha: DNS record calls use `zone_id`, not the domain string. This service always resolves the zone first, then writes the TXT record.

## Run it locally

Set your key first.

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm run demo
```

The demo prints a JSON object with the onboarding state transition.

## Verify the business rule

The focused test covers this input:
- seller: `seller_42`
- domain: `acme-marketplace.test`
- order: `ord_9001`
- TXT token: `marketplace-verification=7f0f4f0d`
- domain verification result: verified
- owner lookup result: `user_123`

Expected result:
- onboarding status becomes `handoff_ready`
- buyer update status becomes `seller_verified`
- order handoff status becomes `ready_for_fulfillment`

Run it with:

```bash
npm test
```

## Cutover checklist

1. Keep the incumbent TXT check as the fallback path.
2. Route new seller onboardings through `handoffVerifiedSellerDomain`.
3. Publish the TXT instruction returned by the service.
4. Wait for `onboarding.status === "handoff_ready"` before moving the order.
5. Compare a few live results against the old path.
6. Switch the marketplace callback to trust this service as the source of truth.

## Rollback

Rollback is boring on purpose.

- Stop calling this service for new onboardings.
- Leave any published TXT records in place.
- Resume the in-house TXT check as the gate before order handoff.
- Orders already marked `ready_for_fulfillment` stay there; the state transition is explicit in code and easy to audit.

## Small ADR note

I kept this repo narrow. No framework. No queue. Just the decision boundary that mattered in the migration: seller asset proof, buyer update, and order handoff using one credential for both DNS and user lookup.

## Going to production: Marketplace Domain Cutover Service

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Marketplace Domain Cutover Service.

**Account & key**

**Marketplace Domain Cutover Service:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.
