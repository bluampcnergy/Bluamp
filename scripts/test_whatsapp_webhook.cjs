/**
 * Verification test for WhatsApp Business Webhook Handshake & Ingestion
 */

async function testWebhookHandshake() {
  console.log('--- Testing WhatsApp Webhook Handshake (GET) ---');
  const verifyToken = 'CNERGY_WA_INVOICE_HOOK_2026';
  const challenge = '1158201444';

  const mockReq = {
    method: 'GET',
    query: {
      'hub.mode': 'subscribe',
      'hub.verify_token': verifyToken,
      'hub.challenge': challenge
    }
  };

  let respondedStatus = 0;
  let respondedBody = '';

  const mockRes = {
    setHeader: () => {},
    status: (code) => {
      respondedStatus = code;
      return {
        send: (body) => { respondedBody = body; },
        json: (body) => { respondedBody = JSON.stringify(body); }
      };
    }
  };

  const handler = (await import('../api/webhooks/whatsapp.ts')).default;
  await handler(mockReq, mockRes);

  console.log(`Response Code: ${respondedStatus}`);
  console.log(`Response Body: ${respondedBody}`);

  if (respondedStatus === 200 && respondedBody === challenge) {
    console.log('✅ GET Handshake Verification Passed!');
  } else {
    console.error('❌ GET Handshake Verification Failed!');
  }
}

testWebhookHandshake().catch(console.error);
