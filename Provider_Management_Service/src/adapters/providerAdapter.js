/**
 * Provider Adapter Factory
 * Abstracts provider-specific API differences for provider management
 * Supports: RedPlug, GreenPlug, BluePlug
 */

const axios = require('axios');

const providers = {
  redPlug: {
    baseUrl: process.env.REDPLUG_BASE_URL || 'https://davinci.softlab.ntua.gr/saas26/redPlug/api',
    endpoints: {
      listProviders: '/providers',
      getProvider: '/provider/{id}',
      registerProvider: '/provider/register',
      updateProvider: '/provider/{id}/update',
      getStatus: '/status'
    }
  },
  greenPlug: {
    baseUrl: process.env.GREENPLUG_BASE_URL || 'https://davinci.softlab.ntua.gr/saas26/greenPlug/api',
    endpoints: {
      listProviders: '/chargingProviders',
      getProvider: '/chargingProvider/{id}',
      registerProvider: '/chargingProvider/register',
      updateProvider: '/chargingProvider/{id}/update',
      getStatus: '/chargingProvider/status'
    }
  },
  bluePlug: {
    baseUrl: process.env.BLUEPLUG_BASE_URL || 'https://davinci.softlab.ntua.gr/saas26/bluePlug/api',
    endpoints: {
      listProviders: '/locations/providers',
      getProvider: '/location/provider/{id}',
      registerProvider: '/provider/register',
      updateProvider: '/location/provider/{id}',
      getStatus: '/provider/status'
    }
  }
};

class ProviderAdapter {
  constructor(providerName) {
    this.provider = providerName;
    this.config = providers[providerName];
    if (!this.config) {
      throw new Error(`Unsupported provider: ${providerName}`);
    }
  }

  /**
   * Build URL for endpoint
   */
  buildUrl(endpoint, params = {}) {
    let url = `${this.config.baseUrl}${this.config.endpoints[endpoint]}`;
    
    // Replace path parameters
    Object.keys(params).forEach(key => {
      url = url.replace(`{${key}}`, params[key]);
    });
    
    return url;
  }

  /**
   * Normalize provider response to standard format
   */
  normalizeProvider(providerData, providerName = this.provider) {
    const normalized = {
      id: providerData.id || providerData.providerId || providerData.provider_id,
      name: providerData.name || providerData.providerName || 'Unknown',
      type: providerData.type || '',
      status: providerData.status || 'active',
      contactEmail: providerData.email || providerData.contactEmail || '',
      phone: providerData.phone || providerData.contact || '',
      apiKey: providerData.apiKey || providerData.api_key || '',
      website: providerData.website || providerData.url || '',
      location: providerData.location || providerData.address || '',
      createdAt: providerData.created_at || providerData.createdAt || new Date(),
      updatedAt: providerData.updated_at || providerData.updatedAt || new Date(),
      _originalProvider: providerName
    };

    return normalized;
  }

  /**
   * Get all providers
   */
  async getProviders() {
    try {
      const url = this.buildUrl('listProviders');
      const response = await axios.get(url, { timeout: 5000 });
      
      const data = Array.isArray(response.data) ? response.data : response.data.data || [];
      return data.map(p => this.normalizeProvider(p));
    } catch (err) {
      console.error(`Error fetching providers from ${this.provider}:`, err.message);
      throw new Error(`Failed to fetch providers from ${this.provider}: ${err.message}`);
    }
  }

  /**
   * Get specific provider
   */
  async getProvider(providerId) {
    try {
      const url = this.buildUrl('getProvider', { id: providerId });
      const response = await axios.get(url, { timeout: 5000 });
      
      const data = response.data.data || response.data;
      return this.normalizeProvider(data);
    } catch (err) {
      if (err.response?.status === 404) {
        throw new Error(`Provider ${providerId} not found in ${this.provider}`);
      }
      console.error(`Error fetching provider ${providerId} from ${this.provider}:`, err.message);
      throw new Error(`Failed to fetch provider: ${err.message}`);
    }
  }

  /**
   * Register provider
   */
  async registerProvider(providerData) {
    try {
      const url = this.buildUrl('registerProvider');
      
      // Map standard fields to provider-specific format
      const mappedData = {
        name: providerData.name,
        type: providerData.type || 'charging_network',
        email: providerData.contactEmail,
        phone: providerData.phone,
        apiKey: providerData.apiKey,
        website: providerData.website,
        address: providerData.location
      };

      const response = await axios.post(url, mappedData, { timeout: 5000 });
      const data = response.data.data || response.data;
      return this.normalizeProvider(data);
    } catch (err) {
      console.error(`Error registering provider on ${this.provider}:`, err.message);
      throw new Error(`Failed to register provider: ${err.message}`);
    }
  }

  /**
   * Update provider
   */
  async updateProvider(providerId, updateData) {
    try {
      const url = this.buildUrl('updateProvider', { id: providerId });
      
      const mappedData = {
        name: updateData.name,
        email: updateData.contactEmail,
        phone: updateData.phone,
        website: updateData.website,
        address: updateData.location
      };

      const response = await axios.put(url, mappedData, { timeout: 5000 });
      const data = response.data.data || response.data;
      return this.normalizeProvider(data);
    } catch (err) {
      console.error(`Error updating provider on ${this.provider}:`, err.message);
      throw new Error(`Failed to update provider: ${err.message}`);
    }
  }

  /**
   * Check provider status
   */
  async checkStatus() {
    try {
      const url = this.buildUrl('getStatus');
      const response = await axios.get(url, { timeout: 5000 });
      
      return {
        provider: this.provider,
        status: 'online',
        statusCode: response.status,
        responseTime: response.headers['x-response-time'] || 'N/A',
        timestamp: new Date()
      };
    } catch (err) {
      console.error(`Status check failed for ${this.provider}:`, err.message);
      return {
        provider: this.provider,
        status: 'offline',
        error: err.message,
        timestamp: new Date()
      };
    }
  }
}

/**
 * Provider Adapter Factory
 */
class ProviderAdapterFactory {
  static createAdapter(providerName) {
    const validProviders = ['redPlug', 'greenPlug', 'bluePlug'];
    
    if (!validProviders.includes(providerName)) {
      throw new Error(`Provider "${providerName}" not supported. Valid providers: ${validProviders.join(', ')}`);
    }

    return new ProviderAdapter(providerName);
  }

  static async getProvidersList() {
    const providersList = {};
    
    for (const providerName of ['redPlug', 'greenPlug', 'bluePlug']) {
      try {
        const adapter = this.createAdapter(providerName);
        providersList[providerName] = {
          status: 'ready',
          config: {
            baseUrl: adapter.config.baseUrl,
            endpoints: Object.keys(adapter.config.endpoints)
          }
        };
      } catch (err) {
        providersList[providerName] = {
          status: 'error',
          error: err.message
        };
      }
    }

    return providersList;
  }
}

module.exports = { ProviderAdapterFactory, ProviderAdapter };
