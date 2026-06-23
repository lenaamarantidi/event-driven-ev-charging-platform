/**
 * RabbitMQ Configuration and Event Consumer
 * Analytics_Service
 *
 * Consumes events:
 * - user_registered (from Auth Service)
 * - provider_registered (from Provider Management Service)
 * - reservation_completed (from Reservation Service)
 */

const amqp = require('amqplib');
const { pool } = require('./db');

let connection = null;
let channel = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXCHANGE_NAME = 'saas_events';

/**
 * Connect to RabbitMQ and setup consumer
 */
async function connectRabbitMQ() {
  connection = await amqp.connect(RABBITMQ_URL);
  channel = await connection.createChannel();

  // Declare topic exchange for all events
  await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

  // Setup queues for different event types
  await setupUserRegistrationQueue();
  await setupProviderRegistrationQueue();
  await setupReservationCompletedQueue();

  console.log('Connected to RabbitMQ - Analytics Service');
  return channel;
}

/**
 * Setup queue for user_registered events
 */
async function setupUserRegistrationQueue() {
  const QUEUE_NAME = 'analytics_user_registered';
  
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'user.registered');
  await channel.prefetch(1);
  
  console.log(`User registration queue "${QUEUE_NAME}" ready`);
  await channel.consume(QUEUE_NAME, (msg) => handleUserRegisteredEvent(msg));
}

/**
 * Setup queue for provider_registered events
 */
async function setupProviderRegistrationQueue() {
  const QUEUE_NAME = 'analytics_provider_registered';
  
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'provider.registered');
  await channel.prefetch(1);
  
  console.log(`Provider registration queue "${QUEUE_NAME}" ready`);
  await channel.consume(QUEUE_NAME, (msg) => handleProviderRegisteredEvent(msg));
}

/**
 * Setup queue for reservation_completed events
 */
async function setupReservationCompletedQueue() {
  const QUEUE_NAME = 'analytics_reservation_completed';
  
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'reservation.completed');
  await channel.prefetch(1);
  
  console.log(`Reservation completed queue "${QUEUE_NAME}" ready`);
  await channel.consume(QUEUE_NAME, (msg) => handleReservationCompletedEvent(msg));
}

/**
 * Handle user_registered event
 */
async function handleUserRegisteredEvent(msg) {
  if (!msg) return;

  try {
    const content = msg.content.toString('utf8');
    const event = JSON.parse(content);
    
    const { userId, timestamp } = event;

    if (!userId) {
      console.error('User registered event missing userId:', event);
      channel.nack(msg, false, false);
      return;
    }

    // Insert into user_registrations
    await pool.query(
      `INSERT IGNORE INTO user_registrations (userId, createdAt)
       VALUES (?, ?)`,
      [userId, new Date(timestamp || Date.now())]
    );

    console.log(`[user_registered] userId=${userId}`);
    channel.ack(msg);
  } catch (err) {
    console.error('Error processing user_registered event:', err.message);
    channel.nack(msg, false, false);
  }
}

/**
 * Handle provider_registered event
 */
async function handleProviderRegisteredEvent(msg) {
  if (!msg) return;

  try {
    const content = msg.content.toString('utf8');
    const event = JSON.parse(content);
    
    const { providerId, providerName, timestamp } = event;

    if (!providerId || !providerName) {
      console.error('Provider registered event missing required fields:', event);
      channel.nack(msg, false, false);
      return;
    }

    // Insert into provider_registrations
    await pool.query(
      `INSERT IGNORE INTO provider_registrations (providerId, providerName, createdAt)
       VALUES (?, ?, ?)`,
      [providerId, providerName, new Date(timestamp || Date.now())]
    );

    console.log(`[provider_registered] providerId=${providerId}, providerName=${providerName}`);
    channel.ack(msg);
  } catch (err) {
    console.error('Error processing provider_registered event:', err.message);
    channel.nack(msg, false, false);
  }
}

/**
 * Handle reservation_completed event
 */
async function handleReservationCompletedEvent(msg) {
  if (!msg) return;

  try {
    const content = msg.content.toString('utf8');
    const event = JSON.parse(content);
    
    const {
      reservationId,
      providerId,
      providerName,
      userId,
      pointId,
      status,
      timestamp
    } = event;

    if (!reservationId || !providerId || !userId || !status) {
      console.error('Reservation completed event missing required fields:', event);
      channel.nack(msg, false, false);
      return;
    }

    const eventTimestamp = new Date(timestamp || Date.now());
    const eventDate = eventTimestamp.toISOString().split('T')[0];

    // 1. Insert into reservation_events (raw event log)
    await pool.query(
      `INSERT INTO reservation_events 
       (reservationId, providerId, providerName, userId, pointId, status, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reservationId, providerId, providerName || 'Unknown', userId, pointId || null, status, eventTimestamp]
    );

    // 2. Update provider daily stats
    const isSuccess = status === 'success' ? 1 : 0;
    const isFailed = status === 'failed' ? 1 : 0;

    await pool.query(
      `INSERT INTO provider_daily_stats 
       (providerId, date, totalReservations, successfulReservations, failedReservations, uniqueUsers)
       VALUES (?, ?, 1, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
       totalReservations = totalReservations + 1,
       successfulReservations = successfulReservations + VALUES(successfulReservations),
       failedReservations = failedReservations + VALUES(failedReservations),
       uniqueUsers = (
         SELECT COUNT(DISTINCT userId) FROM reservation_events
         WHERE providerId = ? AND DATE(timestamp) = ?
       )`,
      [providerId, eventDate, isSuccess, isFailed, providerId, eventDate]
    );

    // 3. Update global daily stats
    await pool.query(
      `INSERT INTO global_daily_stats 
       (date, totalReservations, successfulReservations, failedReservations)
       VALUES (?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE
       totalReservations = totalReservations + 1,
       successfulReservations = successfulReservations + VALUES(successfulReservations),
       failedReservations = failedReservations + VALUES(failedReservations)`,
      [eventDate, isSuccess, isFailed]
    );

    console.log(`[reservation_completed] reservationId=${reservationId}, providerId=${providerId}, status=${status}`);
    channel.ack(msg);
  } catch (err) {
    console.error('Error processing reservation_completed event:', err.message);
    channel.nack(msg, false, false);
  }
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

function __testSetChannel(testChannel) {
  channel = testChannel;
}

function __testResetChannel() {
  channel = null;
}

module.exports = {
  connectRabbitMQ,
  connectWithRetry,
  closeConnection,
  channel: () => channel,
  __testSetChannel,
  __testResetChannel,
  handleUserRegisteredEvent,
  handleProviderRegisteredEvent,
  handleReservationCompletedEvent
};

