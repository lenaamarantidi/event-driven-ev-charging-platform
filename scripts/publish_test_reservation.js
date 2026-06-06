// Test publisher for reservation_successful event
const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXCHANGE = 'billing_exchange';
const ROUTING_KEY = 'reservation_successful';

async function publishTest() {
  try {
    const conn = await amqp.connect(RABBITMQ_URL);
    const ch = await conn.createChannel();
    await ch.assertExchange(EXCHANGE, 'topic', { durable: true });

    const message = {
      eventType: 'reservation_successful',
      type: 'reservation_successful',
      timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false }),
      data: {
        reservationId: 'test-res-123',
        providerId: 42,
        providerName: 'Test Provider',
        pointId: 'point-7',
        duration: 30,
        event_metadata: {
          reservation_id: 'test-res-123',
          provider_id: 42,
          point_id: 'point-7',
          duration_minutes: 30
        }
      }
    };

    const messageBuffer = Buffer.from(JSON.stringify(message), 'utf8');

    const ok = ch.publish(EXCHANGE, ROUTING_KEY, messageBuffer);
    console.log('Published test message:', ok);
    console.log('Message utf8:', messageBuffer.toString('utf8'));
    console.log('Message hex (first 120 chars):', messageBuffer.toString('hex').slice(0,120));

    await ch.close();
    await conn.close();
    process.exit(0);
  } catch (err) {
    console.error('Publish failed:', err.message);
    process.exit(1);
  }
}

publishTest();
