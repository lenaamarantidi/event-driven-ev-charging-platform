/**
 * RabbitMQ Configuration and Consumer Setup
 * Billing_Service
 * 
 * Consumes events:
 * - reservation_successful: When a reservation is made (billable event)
 * - payment_processed: When payment is received
 */

const amqp = require('amqplib');
const fs = require('fs');
const { pool } = require('./db');

let connection = null;
let channel = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXCHANGE_NAME = 'billing_exchange';
const QUEUE_NAME = 'billing_reservation_queue';
const QUEUE_DEADLETTER = 'billing_dlq';

/**
 * Get the default pricing configuration
 */
async function getDefaultPricing() {
  try {
    const [rows] = await pool.query(
      'SELECT cost_per_reservation FROM pricing_config WHERE provider_id IS NULL AND active = 1 LIMIT 1'
    );
    if (rows.length > 0) {
      return rows[0].cost_per_reservation;
    }
    return 0.50; // Default fallback
  } catch (err) {
    console.error('Error fetching pricing:', err.message);
    return 0.50; // Default fallback
  }
}

/**
 * Connect to RabbitMQ and setup consumer
 */
async function connectRabbitMQ() {
  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Declare topic exchange for billing events
    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

    // Declare main queue
    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGE_NAME,
        'x-dead-letter-routing-key': 'billing.error'
      }
    });

    // Bind queue to billing event routing keys
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'reservation_successful');
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'reservation.successful');
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'payment.processed');

    // Setup dead-letter queue
    await channel.assertQueue(QUEUE_DEADLETTER, { durable: true });
    await channel.bindQueue(QUEUE_DEADLETTER, EXCHANGE_NAME, 'billing.error');

    // Set QoS to process one message at a time
    await channel.prefetch(1);

    console.log('Connected to RabbitMQ - Billing Service');
    return channel;
  } catch (err) {
    console.error('RabbitMQ connection error:', err.message);
    throw err;
  }
}

/**
 * Handle incoming billing events
 * Logs billable events for aggregation into invoices
 */
async function handleBillingEvent(msg) {
  if (!msg) return;

  try {
    const raw = msg.content;
    console.log('Received message properties:', msg.properties || {});
    console.log('msg.content typeof:', typeof raw, 'isBuffer:', Buffer.isBuffer(raw));
    console.log(`Raw message length: ${raw ? raw.length : 0}`);

    const content = raw ? raw.toString('utf8') : '';
    console.log('Message content (utf8):', content);
    if (raw) console.log('Message content (hex):', raw.toString('hex'));
    let event;
    try {
      event = JSON.parse(content);
    } catch (parseErr) {
      console.error('JSON.parse failed for message content:', parseErr.message);
      console.error('Message content (utf8):', content);
      if (raw) {
        console.error('Message content (base64):', raw.toString('base64'));
        console.error('Message content (hex):', raw.toString('hex'));
      }

      // Dump raw payload to file for offline inspection
      try {
        fs.mkdirSync('logs', { recursive: true });
        const dump = {
          ts: new Date().toISOString(),
          properties: msg.properties || {},
          utf8: content,
          base64: raw ? raw.toString('base64') : null,
          hex: raw ? raw.toString('hex') : null
        };
        fs.appendFileSync('logs/billing_msg_dumps.log', JSON.stringify(dump) + '\n');
        console.error('Wrote raw message dump to logs/billing_msg_dumps.log');
      } catch (dumpErr) {
        console.error('Failed to write raw message dump:', dumpErr.message);
      }

      // Try a defensive second attempt: sometimes payloads are doubly-encoded strings
      try {
        const inner = JSON.parse(content.replace(/^"|"$/g, ''));
        event = typeof inner === 'string' ? JSON.parse(inner) : inner;
      } catch (secondErr) {
        console.error('Second parse attempt failed:', secondErr.message);
      }
    }

    if (!event) {
      throw new Error('Unable to parse incoming RabbitMQ message into JSON');
    }

    console.log(`Processing billing event: ${event.eventType}`);

    const data = event.data || {};
    const providerId = data.providerId || data.provider_id || data.event_metadata?.provider_id;
    const reservationId = data.reservationId || data.reservation_id || data.event_metadata?.reservation_id;
    const amount = data.amount || data.estimatedCost || data.event_metadata?.amount || 0;
    const timestamp = event.timestamp || data.timestamp || new Date().toISOString();

    if (!providerId) {
      console.error('Event missing providerId:', { event, data });
      channel.nack(msg, false, false); // Dead-letter
      return;
    }

    // Only process reservation_successful events for billing
    if (!event.eventType.includes('reservation') && !event.eventType.includes('successful')) {
      console.log(`Ignoring non-reservation event: ${event.eventType}`);
      channel.ack(msg);
      return;
    }

    // Get the billing month (first day of the month)
    const date = new Date(timestamp);
    const billingMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const billingMonthStr = billingMonth.toISOString().split('T')[0];

    // If no amount provided, use the default pricing
    let billAmount = amount;
    if (!billAmount || billAmount === 0) {
      billAmount = await getDefaultPricing();
    }

    // Normalize reservation id to integer (DB expects integer id); fallback to 0
    let reservationIdParam = parseInt(reservationId, 10);
    if (isNaN(reservationIdParam)) reservationIdParam = 0;

    // Insert billable event
    await pool.query(
      `INSERT INTO billable_events (provider_id, reservation_id, amount, event_type, created_at, billing_month)
       VALUES (?, ?, ?, 'reservation', ?, ?)`,
      [
        providerId,
        reservationIdParam,
        parseFloat(billAmount),
        new Date(timestamp),
        billingMonthStr
      ]
    );

    console.log(`Logged billable event: provider ${providerId}, reservation ${reservationId}, amount ${billAmount} EUR`);
    channel.ack(msg);
  } catch (err) {
    console.error('Error processing billing event:', err.message);
    // Reject without requeue - send to dead letter
    channel.nack(msg, false, false);
  }
}

/**
 * Start consuming billing events
 */
async function startConsumer() {
  if (!channel) {
    console.error('RabbitMQ channel not initialized');
    return;
  }

  try {
    console.log(`Starting consumer on queue: ${QUEUE_NAME}`);
    await channel.consume(QUEUE_NAME, handleBillingEvent, { noAck: false });
  } catch (err) {
    console.error('Failed to start consumer:', err.message);
    throw err;
  }
}

/**
 * Graceful shutdown of RabbitMQ connection
 */
async function closeConnection() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    console.log('RabbitMQ connection closed');
  } catch (err) {
    console.error('Error closing RabbitMQ connection:', err.message);
  }
}

/**
 * Retry logic with exponential backoff
 */
async function connectWithRetry(maxRetries = 5, initialDelay = 2000) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      await connectRabbitMQ();
      await startConsumer();
      return;
    } catch (err) {
      attempt++;
      const delay = initialDelay * Math.pow(2, attempt - 1);
      if (attempt < maxRetries) {
        console.log(`Retry RabbitMQ connection (${attempt}/${maxRetries}) in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
}

module.exports = {
  connectRabbitMQ,
  connectWithRetry,
  startConsumer,
  closeConnection
};
