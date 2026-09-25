import { createInfraiClient } from './infrai_client.js';
import { handoffVerifiedSellerDomain } from './marketplace_handoff.js';

async function main(): Promise<void> {
  const infrai = createInfraiClient();

  const result = await handoffVerifiedSellerDomain(infrai, {
    sellerId: 'seller_42',
    sellerEmail: 'chenhua@changba.com',
    companyDomain: 'acme-marketplace.test',
    verificationToken: 'marketplace-verification=7f0f4f0d',
    orderId: 'ord_9001',
    buyerEmail: 'buyer@example.test'
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
