/**
 * Message Broker / Event Bus
 * Central event publication and subscription system
 * 
 * Events:
 * - PointsImported (from Collector)
 * - PaymentProcessed (from Payment)
 * - InvoiceGenerated (from Billing)
 * - ProviderStatusChanged (from Status)
 * - ProviderRegistered (from Provider Management)
 */

const express = require('express');
const { EventEmitter } = require('events');

const app = express();
app.use(express.json());

// In-memory event store (sliding window, keep last 1000 events)
const eventStore = [];
const MAX_EVENTS = 1000;

// Map of subscribers: eventType -> [{ serviceId, webhookUrl, callback }]
const subscribers = new Map();

/**
 * Core EventEmitter for in-process events
 */
class MessageBroker extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Publish event
   */
  async publishEvent(eventType, data) {
    const event = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: eventType,
      data,
      timestamp: new Date(),
      processed: false
    };

    // Store event
    eventStore.push(event);
    if (eventStore.length > MAX_EVENTS) {
      eventStore.shift();
    }

    console.log(`📢 Event published: ${eventType}`, { id: event.id, timestamp: event.timestamp });

    // Emit to in-process listeners
    this.emit(eventType, event);

    // Trigger webhooks
    await this._triggerWebhooks(eventType, event);

    return event;
  }

  /**
   * Subscribe to events (in-process)
   */
  subscribe(eventType, callback) {
    this.on(eventType, callback);
    console.log(`✓ Subscribed to ${eventType}`);
    return () => this.off(eventType, callback);
  }

  /**
   * Register webhook subscriber
   */
  registerWebhook(eventType, serviceId, webhookUrl) {
    if (!subscribers.has(eventType)) {
      subscribers.set(eventType, []);
    }

    subscribers.get(eventType).push({
      serviceId,
      webhookUrl,
      retries: 0,
      maxRetries: 3
    });

    console.log(`✓ Webhook registered: ${serviceId} → ${eventType}`);

    return {
      subscribedTo: eventType,
      serviceId,
      webhookUrl
    };
  }

  /**
   * Trigger webhooks for event
   */
  async _triggerWebhooks(eventType, event) {
    const subs = subscribers.get(eventType);
    if (!subs || subs.length === 0) return;

    for (const sub of subs) {
      this._sendWebhook(sub, event);
    }
  }

  /**
   * Send webhook with retry logic
   */
  async _sendWebhook(subscriber, event, retryCount = 0) {
    try {
      const axios = require('axios');

      const response = await axios.post(
        subscriber.webhookUrl,
        {
          event: event.type,
          data: event.data,
          eventId: event.id,
          timestamp: event.timestamp
        },
        { timeout: 5000 }
      );

      console.log(`✓ Webhook delivered: ${subscriber.serviceId} (${response.status})`);
    } catch (error) {
      console.error(`✗ Webhook failed for ${subscriber.serviceId}:`, error.message);

      if (retryCount < subscriber.maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, retryCount) * 1000;
        setTimeout(() => {
          this._sendWebhook(subscriber, event, retryCount + 1);
        }, delay);
      }
    }
  }

  /**
   * Get event history
   */
  getEventHistory(eventType = null, limit = 100) {
    let events = eventStore;

    if (eventType) {
      events = events.filter(e => e.type === eventType);
    }

    return events.slice(-limit);
  }
}

// Singleton broker instance
const broker = new MessageBroker();

// ====== REST API Endpoints ======

/**
 * POST /api/events/publish
 * Publish event
 */
app.post('/api/events/publish', async (req, res) => {
  try {
    const { eventType, data } = req.body;

    if (!eventType || !data) {
      return res.status(400).json({ error: 'eventType and data required' });
    }

    const event = await broker.publishEvent(eventType, data);
    res.status(201).json(event);
  } catch (error) {
    console.error('Error publishing event:', error);
    res.status(500).json({ error: 'Failed to publish event', details: error.message });
  }
});

/**
 * POST /api/webhooks/subscribe
 * Register webhook subscription
 */
app.post('/api/webhooks/subscribe', (req, res) => {
  try {
    const { eventType, serviceId, webhookUrl } = req.body;

    if (!eventType || !serviceId || !webhookUrl) {
      return res.status(400).json({ 
        error: 'eventType, serviceId, and webhookUrl required' 
      });
    }

    const subscription = broker.registerWebhook(eventType, serviceId, webhookUrl);
    res.status(201).json(subscription);
  } catch (error) {
    console.error('Error registering webhook:', error);
    res.status(500).json({ error: 'Failed to register webhook', details: error.message });
  }
});

/**
 * GET /api/events/history
 * Get event history
 */
app.get('/api/events/history', (req, res) => {
  try {
    const { eventType, limit = 100 } = req.query;
    const history = broker.getEventHistory(eventType, parseInt(limit));

    res.json({
      count: history.length,
      events: history,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error retrieving history:', error);
    res.status(500).json({ error: 'Failed to retrieve history', details: error.message });
  }
});

/**
 * GET /api/events/stats
 * Get event statistics
 */
app.get('/api/events/stats', (req, res) => {
  try {
    const stats = {
      totalEvents: eventStore.length,
      eventsByType: {},
      subscribers: {}
    };

    // Count by type
    for (const event of eventStore) {
      stats.eventsByType[event.type] = (stats.eventsByType[event.type] || 0) + 1;
    }

    // Count subscribers
    for (const [eventType, subs] of subscribers) {
      stats.subscribers[eventType] = subs.length;
    }

    res.json({
      ...stats,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error retrieving stats:', error);
    res.status(500).json({ error: 'Failed to retrieve stats', details: error.message });
  }
});

/**
 * POST /api/webhooks/unsubscribe
 * Remove webhook subscription
 */
app.post('/api/webhooks/unsubscribe', (req, res) => {
  try {
    const { eventType, serviceId } = req.body;

    if (!eventType || !serviceId) {
      return res.status(400).json({ error: 'eventType and serviceId required' });
    }

    const subs = subscribers.get(eventType);
    if (!subs) {
      return res.status(404).json({ error: 'No subscriptions for this event type' });
    }

    const index = subs.findIndex(s => s.serviceId === serviceId);
    if (index === -1) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    subs.splice(index, 1);
    console.log(`✓ Unsubscribed: ${serviceId} from ${eventType}`);

    res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: 'Failed to unsubscribe', details: error.message });
  }
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'message-broker',
    port: process.env.PORT || 3003,
    eventCount: eventStore.length,
    subscriberCount: Array.from(subscribers.values()).reduce((sum, subs) => sum + subs.length, 0)
  });
});

// ====== Service Initialization ======

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`✓ Message Broker running on port ${PORT}`);
});

module.exports = { app, broker };
