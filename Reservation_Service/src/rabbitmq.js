/**
 * RabbitMQ Publisher
 * Publishes reservation_successful events to billing & analytics services
 */

const amqp = require('amqplib');
require('dotenv').config();

let connection;
let channel;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';

const EXCHANGES = {
  billing: 'billing_exchange',
  analytics: 'analytics_exchange'
};

const QUEUES = {
  billingQueue: 'billing_reservation_queue',
  analyticsQueue: 'analytics_reservation_queue'
};

/**
 * Connect to RabbitMQ with exponential backoff retry
 */
async function connectWithRetry(attempt = 1, maxAttempts = 5) {
  try {
    console.log(`[RabbitMQ] Connecting to ${RABBITMQ_URL}... (attempt ${attempt}/${maxAttempts})`);

    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Declare exchanges
    await channel.assertExchange(EXCHANGES.billing, 'topic', { durable: true });
    await channel.assertExchange(EXCHANGES.analytics, 'topic', { durable: true });

    // Declare queues
    await channel.assertQueue(QUEUES.billingQueue, { durable: true });
    await channel.assertQueue(QUEUES.analyticsQueue, { durable: true });

    // Bind queues to exchanges
    await channel.bindQueue(QUEUES.billingQueue, EXCHANGES.billing, 'reservation_successful');
    await channel.bindQueue(QUEUES.analyticsQueue, EXCHANGES.analytics, 'reservation_successful');

    // Setup dead letter exchanges
    await channel.assertExchange('dlx_billing', 'topic', { durable: true });
    await channel.assertExchange('dlx_analytics', 'topic', { durable: true });

    console.log('✓ RabbitMQ connected successfully');
    console.log('✓ Exchanges & Queues initialized');

    return channel;
  } catch (error) {
    console.error(`[RabbitMQ] Connection failed (attempt ${attempt}/${maxAttempts}):`, error.message);

    if (attempt < maxAttempts) {
      const delayMs = Math.min(2000 * attempt, 10000);
      console.log(`[RabbitMQ] Retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return connectWithRetry(attempt + 1, maxAttempts);
    }

    throw new Error(`Failed to connect to RabbitMQ after ${maxAttempts} attempts`);
  }
}

/**
 * Publish reservation_successful event
 * This event is consumed by Billing_Service and Analytics_Service
 */
async function publishReservationEvent(eventData) {
  try {
    if (!channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    const {
      reservationId,
      providerId,
      providerName,
      pointId,
      duration,
      timestamp
    } = eventData;

    const message = {
      type: 'reservation_successful',
      reservationId,
      providerId,
      providerName,
      pointId,
      duration,
      timestamp,
      // Additional metadata for analytics
      action_type: 'reservation_made',
      event_metadata: {
        reservation_id: reservationId,
        provider_id: providerId,
        point_id: pointId,
        duration_minutes: duration
      }
    };

    const messageBuffer = Buffer.from(JSON.stringify(message, null, 2));

    // Publish to both billing and analytics exchanges
    const billingPublished = channel.publish(
      EXCHANGES.billing,
      'reservation_successful',
      messageBuffer,
      { persistent: true, contentType: 'application/json' }
    );

    const analyticsPublished = channel.publish(
      EXCHANGES.analytics,
      'reservation_successful',
      messageBuffer,
      { persistent: true, contentType: 'application/json' }
    );

    if (!billingPublished || !analyticsPublished) {
      console.warn('[RabbitMQ] Message may not have been queued (backpressure)');
    }

    console.log(`[RabbitMQ] Event published:
      Type: reservation_successful
      Reservation ID: ${reservationId}
      Provider: ${providerName} (ID: ${providerId})
      Point: ${pointId}
      Duration: ${duration} minutes
    `);

    return true;
  } catch (error) {
    console.error('[RabbitMQ] Publishing error:', error.message);
    throw error;
  }
}

/**
 * Get channel (for potential consumers)
 */
function getChannel() {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }
  return channel;
}

/**
 * Close RabbitMQ connection
 */
async function closeConnection() {
  try {
    if (channel) {
      await channel.close();
      console.log('[RabbitMQ] Channel closed');
    }
    if (connection) {
      await connection.close();
      console.log('[RabbitMQ] Connection closed');
    }
  } catch (error) {
    console.error('[RabbitMQ] Error closing connection:', error.message);
  }
}

module.exports = {
  connectWithRetry,
  publishReservationEvent,
  getChannel,
  closeConnection
};
