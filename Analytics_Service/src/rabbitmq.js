/**
 * RabbitMQ Configuration and Consumer Setup
 * Analytics_Service
 * 
 * Consumes events:
 * - point_viewed: When a charging point is viewed
 * - reservation_made: When a reservation is made
 * - search_performed: When users search for charging points
 */

const amqp = require('amqplib');
const { pool } = require('./db');

let connection = null;
let channel = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXCHANGE_NAME = 'analytics_exchange';
const QUEUE_NAME = 'analytics_events_queue';
const QUEUE_DEADLETTER = 'analytics_dlq';

/**
 * Connect to RabbitMQ and setup consumer
 */
async function connectRabbitMQ() {
  try {
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

    // Bind queue to multiple event routing keys
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'point_viewed');
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'reservation_made');
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'search_performed');

    // Setup dead-letter queue
    await channel.assertQueue(QUEUE_DEADLETTER, { durable: true });
    await channel.bindQueue(QUEUE_DEADLETTER, EXCHANGE_NAME, 'analytics.error');

    // Set QoS to process one message at a time
    await channel.prefetch(1);

    console.log('Connected to RabbitMQ - Analytics Service');
    return channel;
  } catch (err) {
    console.error('RabbitMQ connection error:', err.message);
    throw err;
  }
}

/**
 * Handle incoming analytics events
 * Logs them to the database with provider_id and action_type
 */
async function handleAnalyticsEvent(msg) {
  if (!msg) return;

  try {
    const content = msg.content.toString();
    const event = JSON.parse(content);

    console.log(`Processing analytics event: ${event.eventType}`);

    const { data } = event;
    const providerId = data.providerId || data.provider_id;
    let actionType = event.eventType;
    const timestamp = event.timestamp || new Date().toISOString();

    if (!providerId) {
      console.error('Event missing providerId:', event);
      channel.nack(msg, false, false); // Dead-letter
      return;
    }

    // Map event types to action types
    if (actionType.includes('point_viewed') || actionType.includes('point.viewed')) {
      actionType = 'point_viewed';
    } else if (actionType.includes('reservation_made') || actionType.includes('reservation.made')) {
      actionType = 'reservation_made';
    } else if (actionType.includes('search_performed') || actionType.includes('search.performed')) {
      actionType = 'search_performed';
    }

    // Insert into analytics_logs
    await pool.query(
      `INSERT INTO analytics_logs (provider_id, action_type, action_metadata, timestamp)
       VALUES (?, ?, ?, ?)`,
      [
        providerId,
        actionType,
        JSON.stringify(data),
        new Date(timestamp)
      ]
    );

    // Update daily analytics
    const date = new Date(timestamp);
    const dateStr = date.toISOString().split('T')[0];

    const countField = actionType === 'point_viewed' ? 'point_views_count' :
                       actionType === 'reservation_made' ? 'reservations_count' :
                       'searches_count';

    await pool.query(
      `INSERT INTO analytics_daily (provider_id, date, ${countField})
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE ${countField} = ${countField} + 1, last_updated = CURRENT_TIMESTAMP`,
      [providerId, dateStr]
    );

    console.log(`Logged ${actionType} event for provider ${providerId}`);
    channel.ack(msg);
  } catch (err) {
    console.error('Error processing analytics event:', err.message);
    // Reject without requeue - send to dead letter
    channel.nack(msg, false, false);
  }
}

/**
 * Start consuming analytics events
 */
async function startConsumer() {
  if (!channel) {
    console.error('RabbitMQ channel not initialized');
    return;
  }

  try {
    console.log(`Starting consumer on queue: ${QUEUE_NAME}`);
    await channel.consume(QUEUE_NAME, handleAnalyticsEvent, { noAck: false });
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
