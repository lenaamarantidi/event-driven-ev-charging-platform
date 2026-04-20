/**
 * Provider Management Service
 * Manages provider registration, updates, and federation across RedPlug, GreenPlug, BluePlug
 * Port: 3101
 */

const express = require('express');
const { ProviderAdapterFactory } = require('./adapters/providerAdapter');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3101;

// In-memory provider registry (replace with DB in production)
const providerRegistry = new Map();
const providerMappings = new Map(); // saas-id => provider-specific-ids

/**
 * Middleware: Verify auth (simplified for demo)
 */
function verifyAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * POST /providers/register
 * Register a new provider across all platform providers
 */
app.post('/providers/register', verifyAuth, async (req, res) => {
  try {
    const {
      name,
      type,
      contactEmail,
      phone,
      website,
      location,
      externalIds // { redPlug: 'id1', greenPlug: 'id2', bluePlug: 'id3' }
    } = req.body;

    if (!name || !contactEmail) {
      return res.status(400).json({ error: 'Name and contact email required' });
    }

    const saasProviderId = uuidv4();
    const providerData = {
      id: saasProviderId,
      name,
      type: type || 'charging_network',
      contactEmail,
      phone,
      website,
      location,
      externalIds: externalIds || {},
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Register on external providers if credentials provided
    const registrationResults = {};

    for (const [providerName, providerId] of Object.entries(externalIds || {})) {
      try {
        const adapter = ProviderAdapterFactory.createAdapter(providerName);
        const registeredProvider = await adapter.registerProvider(providerData);
        registrationResults[providerName] = {
          status: 'registered',
          externalId: registeredProvider.id
        };
        providerData.externalIds[providerName] = registeredProvider.id;
      } catch (err) {
        registrationResults[providerName] = {
          status: 'failed',
          error: err.message
        };
      }
    }

    providerRegistry.set(saasProviderId, providerData);
    providerMappings.set(saasProviderId, providerData.externalIds);

    res.status(201).json({
      message: 'Provider registered successfully',
      provider: providerData,
      registrationDetails: registrationResults
    });
  } catch (err) {
    console.error('Provider registration error:', err);
    res.status(500).json({ error: 'Provider registration failed', message: err.message });
  }
});

/**
 * GET /providers
 * List all registered providers with aggregated data from all platform providers
 */
app.get('/providers', verifyAuth, async (req, res) => {
  try {
    const { externalSource } = req.query; // Query specific provider if needed

    if (externalSource) {
      // Get providers from external source
      try {
        const adapter = ProviderAdapterFactory.createAdapter(externalSource);
        const externalProviders = await adapter.getProviders();
        
        return res.json({
          source: externalSource,
          total: externalProviders.length,
          providers: externalProviders
        });
      } catch (err) {
        return res.status(400).json({ error: `Failed to fetch from ${externalSource}`, message: err.message });
      }
    }

    // Return SaaS-managed providers
    const providers = Array.from(providerRegistry.values());
    
    res.json({
      total: providers.length,
      source: 'saas-managed',
      providers
    });
  } catch (err) {
    console.error('Error fetching providers:', err);
    res.status(500).json({ error: 'Failed to fetch providers', message: err.message });
  }
});

/**
 * GET /providers/:providerId
 * Get provider details and sync status
 */
app.get('/providers/:providerId', verifyAuth, async (req, res) => {
  try {
    const { providerId } = req.params;
    const provider = providerRegistry.get(providerId);

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    // Check status on external providers
    const externalStatuses = {};

    for (const [providerName, externalId] of Object.entries(provider.externalIds)) {
      try {
        const adapter = ProviderAdapterFactory.createAdapter(providerName);
        const status = await adapter.checkStatus();
        externalStatuses[providerName] = status;
      } catch (err) {
        externalStatuses[providerName] = { status: 'error', error: err.message };
      }
    }

    res.json({
      provider,
      externalStatuses
    });
  } catch (err) {
    console.error('Error fetching provider:', err);
    res.status(500).json({ error: 'Failed to fetch provider', message: err.message });
  }
});

/**
 * PUT /providers/:providerId
 * Update provider information
 */
app.put('/providers/:providerId', verifyAuth, async (req, res) => {
  try {
    const { providerId } = req.params;
    const provider = providerRegistry.get(providerId);

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    // Update SaaS record
    const { name, contactEmail, phone, website, location } = req.body;
    if (name) provider.name = name;
    if (contactEmail) provider.contactEmail = contactEmail;
    if (phone) provider.phone = phone;
    if (website) provider.website = website;
    if (location) provider.location = location;
    provider.updatedAt = new Date();

    // Update on external providers
    const updateResults = {};

    for (const [providerName, externalId] of Object.entries(provider.externalIds)) {
      try {
        const adapter = ProviderAdapterFactory.createAdapter(providerName);
        const updated = await adapter.updateProvider(externalId, req.body);
        updateResults[providerName] = { status: 'updated', data: updated };
      } catch (err) {
        updateResults[providerName] = { status: 'failed', error: err.message };
      }
    }

    res.json({
      message: 'Provider updated successfully',
      provider,
      updateDetails: updateResults
    });
  } catch (err) {
    console.error('Provider update error:', err);
    res.status(500).json({ error: 'Provider update failed', message: err.message });
  }
});

/**
 * POST /providers/:providerId/sync
 * Manually sync provider data from external source
 */
app.post('/providers/:providerId/sync', verifyAuth, async (req, res) => {
  try {
    const { providerId } = req.params;
    const { sources } = req.body; // ['redPlug', 'greenPlug', 'bluePlug']

    const provider = providerRegistry.get(providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const syncResults = {};

    for (const providerName of (sources || Object.keys(provider.externalIds))) {
      try {
        const adapter = ProviderAdapterFactory.createAdapter(providerName);
        const externalProvider = await adapter.getProvider(provider.externalIds[providerName] || providerId);
        
        // Update local record with external data
        Object.assign(provider, externalProvider);
        provider.updatedAt = new Date();

        syncResults[providerName] = { status: 'synced', data: externalProvider };
      } catch (err) {
        syncResults[providerName] = { status: 'failed', error: err.message };
      }
    }

    res.json({
      message: 'Provider sync completed',
      provider,
      syncDetails: syncResults
    });
  } catch (err) {
    console.error('Provider sync error:', err);
    res.status(500).json({ error: 'Provider sync failed', message: err.message });
  }
});

/**
 * GET /providers/status/all
 * Check status of all external providers
 */
app.get('/providers/status/all', async (req, res) => {
  try {
    const statusList = {};

    for (const providerName of ['redPlug', 'greenPlug', 'bluePlug']) {
      try {
        const adapter = ProviderAdapterFactory.createAdapter(providerName);
        const status = await adapter.checkStatus();
        statusList[providerName] = status;
      } catch (err) {
        statusList[providerName] = {
          provider: providerName,
          status: 'error',
          error: err.message
        };
      }
    }

    res.json({
      timestamp: new Date(),
      statuses: statusList
    });
  } catch (err) {
    console.error('Error checking provider statuses:', err);
    res.status(500).json({ error: 'Failed to check statuses', message: err.message });
  }
});

/**
 * GET /providers/health
 * Service health check
 */
app.get('/providers/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Provider Management Service',
    port: PORT,
    timestamp: new Date(),
    registeredProviders: providerRegistry.size
  });
});

/**
 * Error handling
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    status: err.status || 500
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Provider Management Service listening on port ${PORT}`);
  console.log(`📍 Provider Adapters configured for: RedPlug, GreenPlug, BluePlug`);
});

module.exports = app;
