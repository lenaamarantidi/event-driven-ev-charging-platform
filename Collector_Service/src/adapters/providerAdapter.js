/**
 * Collector Service - Provider Adapter
 * Collects charging point data from RedPlug, GreenPlug, BluePlug
 * Handles data normalization and import
 */

const axios = require('axios');

const collectorConfigs = {
  redPlug: {
    baseUrl: process.env.REDPLUG_BASE_URL || 'https://davinci.softlab.ntua.gr/saas26/redPlug/api',
    endpoints: {
      pointsList: '/points',
      pointDetail: '/point/{id}',
      pointsStats: '/points/statistics'
    },
    batchSize: 100
  },
  greenPlug: {
    baseUrl: process.env.GREENPLUG_BASE_URL || 'https://davinci.softlab.ntua.gr/saas26/greenPlug/api',
    endpoints: {
      pointsList: '/chargingPoints',
      pointDetail: '/chargingPoints/{id}',
      pointsStats: '/chargingPoints/stats'
    },
    batchSize: 100
  },
  bluePlug: {
    baseUrl: process.env.BLUEPLUG_BASE_URL || 'https://davinci.softlab.ntua.gr/saas26/bluePlug/api',
    endpoints: {
      pointsList: '/locations',
      pointDetail: '/location/{id}',
      pointsStats: '/location/statistics'
    },
    batchSize: 100
  }
};

class CollectorAdapter {
  constructor(providerName) {
    this.provider = providerName;
    this.config = collectorConfigs[providerName];
    if (!this.config) {
      throw new Error(`Collector: Unsupported provider: ${providerName}`);
    }
  }

  buildUrl(endpoint, params = {}) {
    let url = `${this.config.baseUrl}${this.config.endpoints[endpoint]}`;
    Object.keys(params).forEach(key => {
      url = url.replace(`{${key}}`, params[key]);
    });
    return url;
  }

  /**
   * Normalize charging point data from different providers
   */
  normalizePoint(pointData) {
    // Handle different provider field names
    let status = pointData.status || 'available';
    if (pointData.state) status = pointData.state; // GreenPlug
    if (pointData.availability) status = pointData.availability; // BluePlug

    let capacity = pointData.capacity_kw || pointData.capacity || pointData.power || 0;
    if (pointData.kwhprice) capacity = parseFloat(capacity); // Ensure number

    let price = pointData.kwh_price || pointData.price || pointData.kwhprice || 0;

    const normalized = {
      id: pointData.id || pointData.pointid || pointData.location_id,
      provider: this.provider,
      latitude: pointData.latitude || pointData.lat || pointData.y,
      longitude: pointData.longitude || pointData.lon || pointData.x,
      name: pointData.name || pointData.point_name || 'Unknown',
      address: pointData.address || pointData.location || '',
      status: status,
      capacity_kw: capacity,
      price_per_kwh: price,
      connectorTypes: pointData.connectors || pointData.connector_types || [],
      availability: pointData.availability || null,
      lastUpdated: pointData.last_updated || pointData.lastUpdated || new Date(),
      features: pointData.features || [],
      _raw: pointData
    };

    return normalized;
  }

  /**
   * Fetch all points from provider
   */
  async fetchAllPoints(skip = 0, limit = this.config.batchSize) {
    try {
      const url = this.buildUrl('pointsList');
      console.log(`[${this.provider}] Fetching points from: ${url}`);

      const response = await axios.get(url, {
        params: { skip, limit },
        timeout: 10000
      });

      const points = Array.isArray(response.data) 
        ? response.data 
        : response.data.data || response.data.points || [];

      console.log(`[${this.provider}] Received ${points.length} points`);
      return points.map(p => this.normalizePoint(p));
    } catch (err) {
      console.error(`[${this.provider}] Error fetching points:`, err.message);
      throw new Error(`Collector: Failed to fetch points from ${this.provider}: ${err.message}`);
    }
  }

  /**
   * Fetch specific point detail
   */
  async fetchPointDetail(pointId) {
    try {
      const url = this.buildUrl('pointDetail', { id: pointId });
      const response = await axios.get(url, { timeout: 5000 });

      const pointData = response.data.data || response.data;
      return this.normalizePoint(pointData);
    } catch (err) {
      console.error(`[${this.provider}] Error fetching point ${pointId}:`, err.message);
      throw new Error(`Failed to fetch point detail: ${err.message}`);
    }
  }

  /**
   * Fetch statistics
   */
  async fetchStatistics() {
    try {
      const url = this.buildUrl('pointsStats');
      const response = await axios.get(url, { timeout: 5000 });

      return response.data.data || response.data;
    } catch (err) {
      console.error(`[${this.provider}] Error fetching statistics:`, err.message);
      return { provider: this.provider, error: err.message };
    }
  }

  /**
   * Stream points in batches
   */
  async *streamPoints(batchSize = this.config.batchSize) {
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const points = await this.fetchAllPoints(skip, batchSize);
        
        if (points.length === 0) {
          hasMore = false;
        } else {
          yield points;
          skip += points.length;
        }
      } catch (err) {
        console.error(`[${this.provider}] Stream error:`, err.message);
        hasMore = false;
      }
    }
  }
}

/**
 * Collector Adapter Factory
 */
class CollectorAdapterFactory {
  static createAdapter(providerName) {
    const validProviders = ['redPlug', 'greenPlug', 'bluePlug'];
    
    if (!validProviders.includes(providerName)) {
      throw new Error(`Collector: "${providerName}" not supported. Valid: ${validProviders.join(', ')}`);
    }

    return new CollectorAdapter(providerName);
  }

  static async collectFromAllProviders() {
    const results = {
      timestamp: new Date(),
      providers: {}
    };

    for (const providerName of ['redPlug', 'greenPlug', 'bluePlug']) {
      try {
        const adapter = this.createAdapter(providerName);
        const points = await adapter.fetchAllPoints(0, 100);
        
        results.providers[providerName] = {
          status: 'success',
          pointsCount: points.length,
          points: points.slice(0, 10) // First 10 for preview
        };
      } catch (err) {
        results.providers[providerName] = {
          status: 'failed',
          error: err.message
        };
      }
    }

    return results;
  }

  static async collectProviderStatistics() {
    const stats = {
      timestamp: new Date(),
      providers: {}
    };

    for (const providerName of ['redPlug', 'greenPlug', 'bluePlug']) {
      try {
        const adapter = this.createAdapter(providerName);
        stats.providers[providerName] = await adapter.fetchStatistics();
      } catch (err) {
        stats.providers[providerName] = {
          status: 'failed',
          error: err.message
        };
      }
    }

    return stats;
  }
}

module.exports = { CollectorAdapterFactory, CollectorAdapter };
