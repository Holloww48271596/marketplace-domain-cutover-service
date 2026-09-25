import { z } from 'zod';
import type { InfraiClient } from './infrai_client.js';

const handoffRequestSchema = z.object({
  sellerId: z.string().min(1),
  sellerEmail: z.string().email(),
  companyDomain: z.string().min(1),
  verificationToken: z.string().min(1),
  orderId: z.string().min(1),
  buyerEmail: z.string().email()
});

export type HandoffRequest = z.infer<typeof handoffRequestSchema>;

export type HandoffResult = {
  onboarding: {
    sellerId: string;
    domain: string;
    status: 'awaiting_txt_publish' | 'handoff_ready';
    ownerUserId: string | null;
  };
  sellerAsset: {
    kind: 'company_domain';
    domain: string;
    zoneId: string;
    txtRecord: {
      name: string;
      value: string;
      recordType: 'TXT';
    };
    verification: 'pending' | 'verified';
  };
  buyerUpdate: {
    buyerEmail: string;
    orderId: string;
    status: 'waiting_on_seller_domain' | 'seller_verified';
  };
  orderHandoff: {
    orderId: string;
    status: 'blocked' | 'ready_for_fulfillment';
    sellerOwnerEmail: string | null;
  };
};

function readZoneId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.zone_id === 'string') {
    return candidate.zone_id;
  }
  if (candidate.domain && typeof candidate.domain === 'object') {
    const nested = candidate.domain as Record<string, unknown>;
    if (typeof nested.zone_id === 'string') {
      return nested.zone_id;
    }
  }
  return null;
}

function readVerified(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.verified === 'boolean') {
    return candidate.verified;
  }
  if (candidate.domain && typeof candidate.domain === 'object') {
    const nested = candidate.domain as Record<string, unknown>;
    if (typeof nested.verified === 'boolean') {
      return nested.verified;
    }
  }
  return false;
}

function readUserId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.user_id === 'string') {
    return candidate.user_id;
  }
  if (typeof candidate.id === 'string') {
    return candidate.id;
  }
  if (candidate.user && typeof candidate.user === 'object') {
    const nested = candidate.user as Record<string, unknown>;
    if (typeof nested.user_id === 'string') {
      return nested.user_id;
    }
    if (typeof nested.id === 'string') {
      return nested.id;
    }
  }
  return null;
}

async function ensureZoneId(infrai: InfraiClient, domain: string): Promise<string> {
  const existing = await infrai.dns.domain.get({ domain });
  const existingZoneId = readZoneId(existing);
  if (existingZoneId) {
    return existingZoneId;
  }

  const created = await infrai.dns.domain.add({
    domain,
    vendor: 'marketplace-cutover',
    metadata: {
      purpose: 'seller-onboarding'
    }
  });
  const createdZoneId = readZoneId(created);
  if (!createdZoneId) {
    throw new Error('Expected zone_id from domain add');
  }
  return createdZoneId;
}

export async function handoffVerifiedSellerDomain(
  infrai: InfraiClient,
  input: HandoffRequest
): Promise<HandoffResult> {
  const request = handoffRequestSchema.parse(input);
  const zoneId = await ensureZoneId(infrai, request.companyDomain);

  await infrai.dns.record.upsert({
    zone_id: zoneId,
    record_type: 'TXT',
    name: `_marketplace-verify.${request.companyDomain}`,
    content: request.verificationToken,
    ttl: 300,
    metadata: {
      seller_id: request.sellerId,
      order_id: request.orderId
    }
  });

  const verification = await infrai.dns.domain.verify({
    domain: request.companyDomain
  });
  const verified = readVerified(verification);

  if (!verified) {
    return {
      onboarding: {
        sellerId: request.sellerId,
        domain: request.companyDomain,
        status: 'awaiting_txt_publish',
        ownerUserId: null
      },
      sellerAsset: {
        kind: 'company_domain',
        domain: request.companyDomain,
        zoneId,
        txtRecord: {
          name: `_marketplace-verify.${request.companyDomain}`,
          value: request.verificationToken,
          recordType: 'TXT'
        },
        verification: 'pending'
      },
      buyerUpdate: {
        buyerEmail: request.buyerEmail,
        orderId: request.orderId,
        status: 'waiting_on_seller_domain'
      },
      orderHandoff: {
        orderId: request.orderId,
        status: 'blocked',
        sellerOwnerEmail: null
      }
    };
  }

  const owner = await infrai.auth.user.get_by_email({
    email: request.sellerEmail
  });
  const ownerUserId = readUserId(owner);

  return {
    onboarding: {
      sellerId: request.sellerId,
      domain: request.companyDomain,
      status: 'handoff_ready',
      ownerUserId
    },
    sellerAsset: {
      kind: 'company_domain',
      domain: request.companyDomain,
      zoneId,
      txtRecord: {
        name: `_marketplace-verify.${request.companyDomain}`,
        value: request.verificationToken,
        recordType: 'TXT'
      },
      verification: 'verified'
    },
    buyerUpdate: {
      buyerEmail: request.buyerEmail,
      orderId: request.orderId,
      status: 'seller_verified'
    },
    orderHandoff: {
      orderId: request.orderId,
      status: 'ready_for_fulfillment',
      sellerOwnerEmail: request.sellerEmail
    }
  };
}
