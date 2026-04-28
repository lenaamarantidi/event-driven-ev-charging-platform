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
      listPoints: '/points',
      getPoint: '/point/{pointid}',
      reserve: '/reserve/{pointid}',
      reserveWithDuration: '/reserve/{pointid}/{minutes}',
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
      listChargingPoints: '/chargingPoints',
      getChargingPoint: '/chargingPoints/{pointid}',
      createReservation: '/chargingPoints/{pointid}/reservations',
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
      listLocations: '/locations',
      getLocationStatus: '/location/{pointid}/status',
      holdCharger: '/location/{pointid}/hold',
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

  /**
   * List charging points for a provider
   */
  async listChargingPoints(authToken = null) {
    try {
      let endpoint, url;
      
      if (this.provider === 'redPlug') {
        endpoint = 'listPoints';
      } else if (this.provider === 'greenPlug') {
        endpoint = 'listChargingPoints';
      } else if (this.provider === 'bluePlug') {
        endpoint = 'listLocations';
      }
      
      url = this.buildUrl(endpoint);
      
      const headers = {};
      if (authToken) {
        headers.authorization = authToken;
      }
      
      const response = await axios.get(url, { headers, timeout: 5000 });
      const data = Array.isArray(response.data) ? response.data : response.data.data || [];
      
      return data.map(point => this.normalizeChargingPoint(point));
    } catch (err) {
      console.error(`Error fetching charging points from ${this.provider}:`, err.message);
      throw new Error(`Failed to fetch charging points from ${this.provider}: ${err.message}`);
    }
  }

  /**
   * Get specific charging point details
   */
  async getChargingPoint(pointId, authToken = null) {
    try {
      let endpoint, url;
      
      if (this.provider === 'redPlug') {
        endpoint = 'getPoint';
      } else if (this.provider === 'greenPlug') {
        endpoint = 'getChargingPoint';
      } else if (this.provider === 'bluePlug') {
        endpoint = 'getLocationStatus';
      }
      
      url = this.buildUrl(endpoint, { pointid: pointId });
      
      const headers = {};
      if (authToken) {
        headers.authorization = authToken;
      }
      
      const response = await axios.get(url, { headers, timeout: 5000 });
      const data = response.data.data || response.data;
      
      return this.normalizeChargingPoint(data);
    } catch (err) {
      if (err.response?.status === 404) {
        throw new Error(`Charging point ${pointId} not found in ${this.provider}`);
      }
      console.error(`Error fetching charging point ${pointId} from ${this.provider}:`, err.message);
      throw new Error(`Failed to fetch charging point: ${err.message}`);
    }
  }

  /**
   * Reserve a charging point
   */
  async reserveChargingPoint(pointId, duration = 60, authToken = null) {
    try {
      let url, endpoint, body = {};
      
      if (this.provider === 'redPlug') {
        // redPlug supports reserve with duration
        endpoint = duration ? 'reserveWithDuration' : 'reserve';
        url = this.buildUrl(endpoint, { 
          pointid: pointId,
          minutes: duration
        });
      } else if (this.provider === 'greenPlug') {
        // greenPlug uses POST with JSON body
        endpoint = 'createReservation';
        url = this.buildUrl(endpoint, { pointid: pointId });
        body = { duration };
      } else if (this.provider === 'bluePlug') {
        // bluePlug uses query parameter for minutes
        endpoint = 'holdCharger';
        url = this.buildUrl(endpoint, { pointid: pointId });
        url += `?minutes=${duration}`;
      }
      
      const headers = {};
      if (authToken) {
        headers.authorization = authToken;
      }
      
      const response = await axios.post(url, body, { headers, timeout: 5000 });
      const data = response.data.data || response.data;
      
      return this.normalizeReservation(data);
    } catch (err) {
      console.error(`Error reserving charging point ${pointId} on ${this.provider}:`, err.message);
      throw new Error(`Failed to reserve charging point: ${err.message}`);
    }
  }

  /**
   * Normalize charging point response to standard format
   */
  normalizeChargingPoint(pointData) {
    let normalized = {
      pointid: null,
      providerName: this.provider,
      status: null,
      reservedUntil: null,
      capacity: null,
      connector: null,
      locationName: null,
      address: null,
      pricePerKwh: null
    };
    
    if (this.provider === 'redPlug') {
      normalized.pointid = pointData.pointid;
      normalized.status = pointData.status;
      normalized.reservedUntil = pointData.reservationendtime;
      normalized.capacity = pointData.cap;
      normalized.connector = pointData.connector;
      normalized.locationName = pointData.locationName;
      normalized.address = pointData.address;
    } else if (this.provider === 'greenPlug') {
      normalized.pointid = pointData.id;
      normalized.status = pointData.state;
      normalized.reservedUntil = pointData.reservedUntil;
      normalized.capacity = pointData.cap;
      normalized.connector = pointData.connector;
      normalized.locationName = pointData.locationName;
      normalized.address = pointData.address;
      normalized.pricePerKwh = pointData.kwhRateEur;
    } else if (this.provider === 'bluePlug') {
      normalized.pointid = pointData.chargerId;
      normalized.status = pointData.currentStatus;
      normalized.reservedUntil = pointData.reservationEnd;
      normalized.capacity = pointData.cap;
      normalized.connector = pointData.connector;
      normalized.locationName = pointData.locationName;
      normalized.address = pointData.address;
      normalized.pricePerKwh = pointData.pricePerKwh;
    }
    
    return normalized;
  }

  /**
   * Normalize reservation response to standard format
   */
  normalizeReservation(reservationData) {
    let normalized = {
      pointid: null,
      providerName: this.provider,
      status: null,
      reservedUntil: null,
      pricePerKwh: null
    };
    
    if (this.provider === 'redPlug') {
      normalized.pointid = reservationData.pointid;
      normalized.status = reservationData.status;
      normalized.reservedUntil = reservationData.reservationendtime;
    } else if (this.provider === 'greenPlug') {
      normalized.pointid = reservationData.id;
      normalized.status = reservationData.state;
      normalized.reservedUntil = reservationData.reservedUntil;
      normalized.pricePerKwh = reservationData.kwhRateEur;
    } else if (this.provider === 'bluePlug') {
      normalized.pointid = reservationData.chargerId;
      normalized.status = reservationData.currentStatus;
      normalized.reservedUntil = reservationData.reservationEnd;
      normalized.pricePerKwh = reservationData.pricePerKwh;
    }
    
    return normalized;
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
