/**
 * RabbitMQ Configuration and Consumer Setup
 * Analytics_Service
 *
 * Consumes events:
 * - analytics.reservations.daily (published by Reservation_Service)
 */

const amqp = require('amqplib');
const { pool } = require('./db');

let connection = null;
let channel = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXCHANGE_NAME = 'analytics_exchange';
const QUEUE_NAME = 'analytics_reservation_queue';
const QUEUE_DEADLETTER = 'analytics_dlq';

/**
 * Connect to RabbitMQ and setup consumer
 */
async function connectRabbitMQ() {
  connection = await amqp.connect(RABBITMQ_URL);
  channel = await connection.createChannel();

  // Declare topic exchange for analytics events
  await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

  // Declare main queue
  await channel.assertQueue(QUEUE_NAME, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': EXCHANGE_NAME,
      'x-dead-letter-routing-key': 'analytics.error'
    }
  });

  // Bind queue to only the reservation daily analytics event
  await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'analytics.reservations.daily');

  // Setup dead-letter queue
  await channel.assertQueue(QUEUE_DEADLETTER, { durable: true });
  await channel.bindQueue(QUEUE_DEADLETTER, EXCHANGE_NAME, 'analytics.error');

  // Set QoS to process one message at a time
  await channel.prefetch(1);

  console.log('Connected to RabbitMQ - Analytics Service');
  return channel;
}

function toISOOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Handle incoming analytics events
 */
async function handleAnalyticsEvent(msg) {
  if (!msg) return;

  try {
    const content = msg.content ? msg.content.toString('utf8') : '';

    let event;
    try {
      event = JSON.parse(content);
    } catch (parseErr) {
      console.error('Invalid JSON received by Analytics_Service:', parseErr.message);
      channel.nack(msg, false, false); // dead-letter
      return;
    }

    if (!event || !event.data) {
      console.error('Analytics event missing data:', event);
      channel.nack(msg, false, false);
      return;
    }

    const { data = {} } = event;

    const eventType = event.eventType || event.type;
    if (eventType !== 'analytics_reservations_daily') {
      // Not expected on this queue; treat as dead-letter to avoid silent drops.
      console.error('Unexpected event type on analytics.reservations.daily queue:', {
        received: eventType,
        event
      });
      channel.nack(msg, false, false);
      return;
    }

    const dateStr = data.date || toISOOrNull(event.timestamp)?.split('T')[0];
    const reservationLogs = Array.isArray(data.reservationLogs) ? data.reservationLogs : [];

    if (!dateStr) {
      console.error('Daily analytics message missing date:', { dateStr, event });
      channel.nack(msg, false, false);
      return;
    }

    // 1) Insert one analytics_logs row per reservation log
    for (const rl of reservationLogs) {
      const pid = rl?.providerId;
      if (!pid) continue;

      const isoTs = toISOOrNull(rl?.createdAt) || toISOOrNull(rl?.created_at) || toISOOrNull(event.timestamp) || new Date().toISOString();

      await pool.query(
        `INSERT INTO analytics_logs (provider_id, action_type, action_metadata, timestamp)
         VALUES (?, ?, ?, ?)` ,
        [pid, 'reservations_daily_batch', JSON.stringify(rl ?? {}), isoTs]
      );
    }

    // 2) Update analytics_daily reservations_count from reservationLogs
    // Reservation_Service daily payload has no data.providers; compute counts here.
    const countsByProvider = new Map();
    for (const rl of reservationLogs) {
      const pid = rl?.providerId;
      if (!pid) continue;
      const prev = countsByProvider.get(pid) || 0;
      countsByProvider.set(pid, prev + 1);
    }

    for (const [pid, count] of countsByProvider.entries()) {
      if (!count) continue;
      await pool.query(
        `INSERT INTO analytics_daily (provider_id, date, reservations_count)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE reservations_count = reservations_count + VALUES(reservations_count), last_updated = CURRENT_TIMESTAMP`,
        [pid, dateStr, count]
      );
    }

    console.log(`Processed daily analytics reservations for date=${dateStr} logs=${reservationLogs.length}`);
    channel.ack(msg);
  } catch (err) {
    console.error('Error processing analytics event:', err.message);
    channel.nack(msg, false, false);
  }
}

async function startConsumer() {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }

  console.log(`Starting consumer on queue: ${QUEUE_NAME}`);
  await channel.consume(QUEUE_NAME, handleAnalyticsEvent, { noAck: false });
}

async function closeConnection() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    console.log('RabbitMQ connection closed');
  } catch (err) {
    console.error('Error closing RabbitMQ connection:', err.message);
  }
}

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

