import { describe, expect, it } from 'vitest';
import { handoffVerifiedSellerDomain } from '../src/marketplace_handoff.js';
import type { InfraiClient } from '../src/infrai_client.js';

function createStubInfrai(): InfraiClient {
  return {
    dns: {
      domain: {
        async get() {
          return { zone_id: 'zone_123' };
        },
        async add() {
          return { zone_id: 'zone_123' };
        },
        async verify() {
          return { verified: true };
        }
      },
      record: {
        async upsert(input) {
          expect(input.zone_id).toBe('zone_123');
          expect(input.record_type).toBe('TXT');
          expect(input.name).toBe('_marketplace-verify.acme-marketplace.test');
          expect(input.content).toBe('marketplace-verification=7f0f4f0d');
          return { record_id: 'rec_123' };
        }
      }
    },
    auth: {
      user: {
        async get_by_email(input) {
          expect(input.email).toBe('owner@acme-marketplace.test');
          return { user_id: 'user_123' };
        }
      }
    }
  };
}

describe('handoffVerifiedSellerDomain', () => {
  it('marks onboarding complete only after TXT verification succeeds', async () => {
    const infrai = createStubInfrai();

    const result = await handoffVerifiedSellerDomain(infrai, {
      sellerId: 'seller_42',
      sellerEmail: 'owner@acme-marketplace.test',
      companyDomain: 'acme-marketplace.test',
      verificationToken: 'marketplace-verification=7f0f4f0d',
      orderId: 'ord_9001',
      buyerEmail: 'buyer@example.test'
    });

    expect(result.onboarding.status).toBe('handoff_ready');
    expect(result.onboarding.ownerUserId).toBe('user_123');
    expect(result.buyerUpdate.status).toBe('seller_verified');
    expect(result.orderHandoff.status).toBe('ready_for_fulfillment');
    expect(result.sellerAsset.zoneId).toBe('zone_123');
  });
});
