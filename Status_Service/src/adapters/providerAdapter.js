/**
 * Provider API Configuration & Adapter
 * 
 * Κάθε πάροχος έχει διαφορετική σύνταξη endpoints.
 * Αυτό το αρχείο κάνει το mapping για να τις ενοποιήσουμε.
 */

const providerConfigs = {
  redPlug: {
    name: 'redPlug',
    baseUrl: process.env.REDPLUG_API_URL || 'https://davinci.softlab.ntua.gr/saas26/redPlug/api',
    endpoints: {
      listPoints: '/points',
      getPoint: '/point/{pointid}',
      reserve: '/reserve/{pointid}',
      reserveWithMinutes: '/reserve/{pointid}/{minutes}'
    }
  },
  greenPlug: {
    name: 'greenPlug',
    baseUrl: process.env.GREENPLUG_API_URL || 'https://davinci.softlab.ntua.gr/saas26/greenPlug/api',
    endpoints: {
      listPoints: '/chargingPoints',
      getPoint: '/chargingPoints/{pointid}',
      reserve: '/chargingPoints/{pointid}/reservations',
      reserveWithMinutes: '/chargingPoints/{pointid}/reservations/{minutes}'
    }
  },
  bluePlug: {
    name: 'bluePlug',
    baseUrl: process.env.BLUEPLUG_API_URL || 'https://davinci.softlab.ntua.gr/saas26/bluePlug/api',
    endpoints: {
      listPoints: '/locations',
      getPoint: '/location/{pointid}',
      reserve: '/location/{pointid}/hold',
      reserveWithMinutes: '/location/{pointid}/hold/{minutes}'
    }
  }
};

/**
 * Factory για δημιουργία provider adapter
 */
class ProviderAdapterFactory {
  static createAdapter(providerName) {
    const config = providerConfigs[providerName];
    if (!config) {
      throw new Error(`Provider ${providerName} not found`);
    }
    return new ProviderAdapter(config);
  }

  static getAllProviders() {
    return Object.keys(providerConfigs);
  }

  static getConfig(providerName) {
    return providerConfigs[providerName];
  }
}

/**
 * Provider Adapter - κάνει requests βάσει του provider config
 */
class ProviderAdapter {
  constructor(config) {
    this.config = config;
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.endpoints = config.endpoints;
  }

  /**
   * Κατασκευή URL για list points
   */
  getListPointsUrl() {
    return `${this.baseUrl}${this.endpoints.listPoints}`;
  }

  /**
   * Κατασκευή URL για get point
   */
  getPointUrl(pointid) {
    return `${this.baseUrl}${this.endpoints.getPoint.replace('{pointid}', pointid)}`;
  }

  /**
   * Κατασκευή URL για reserve (χωρίς minutes)
   */
  getReserveUrl(pointid) {
    return `${this.baseUrl}${this.endpoints.reserve.replace('{pointid}', pointid)}`;
  }

  /**
   * Κατασκευή URL για reserve (με minutes)
   */
  getReserveWithMinutesUrl(pointid, minutes) {
    let endpoint = this.endpoints.reserveWithMinutes
      .replace('{pointid}', pointid)
      .replace('{minutes}', minutes);
    return `${this.baseUrl}${endpoint}`;
  }

  /**
   * Normalize response από διαφορετικούς παρόχους
   */
  normalizePoint(rawPoint) {
    return {
      pointid: rawPoint.pointid || rawPoint.id,
      provider: this.name,
      lon: rawPoint.lon || rawPoint.longitude,
      lat: rawPoint.lat || rawPoint.latitude,
      status: rawPoint.status,
      capacity_kw: rawPoint.cap || rawPoint.capacity,
      kwh_price: rawPoint.kwhprice || rawPoint.price || 0,
      reservation_end_time: rawPoint.reservationendtime || rawPoint.reservation_end || null
    };
  }

  /**
   * Normalize reservation response
   */
  normalizeReservation(rawReservation) {
    return {
      pointid: rawReservation.pointid || rawReservation.id,
      status: rawReservation.status,
      reservation_end_time: rawReservation.reservationendtime || rawReservation.reservation_end,
      success: rawReservation.status === 'reserved'
    };
  }

  /**
   * Check provider health
   */
  async checkHealth() {
    const axios = require('axios');
    const startTime = Date.now();

    try {
      // Try accessing the list points endpoint as health check
      const url = this.getListPointsUrl();
      const response = await axios.get(url, { timeout: 5000 });

      const responseTime = Date.now() - startTime;

      return {
        provider: this.name,
        status: 'online',
        statusCode: response.status,
        responseTime,
        endpoint: url,
        timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
      };
    } catch (err) {
      const responseTime = Date.now() - startTime;

      return {
        provider: this.name,
        status: 'offline',
        error: err.message,
        responseTime,
        endpoint: this.getListPointsUrl(),
        statusCode: err.response?.status || 'N/A',
        timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
      };
    }
  }

  /**
   * Check critical endpoints
   */
  async checkCriticalEndpoints() {
    const axios = require('axios');
    const results = {
      provider: this.name,
      endpoints: {}
    };

    const endpointKeys = ['listPoints', 'getPoint', 'reserve'];

    for (const key of endpointKeys) {
      const startTime = Date.now();
      try {
        let url;
        if (key === 'listPoints') {
          url = this.getListPointsUrl();
        } else if (key === 'getPoint') {
          url = this.getPointUrl('test-id');
        } else if (key === 'reserve') {
          url = this.getReserveUrl('test-id');
        }

        const response = await axios.get(url, { timeout: 5000 });
        results.endpoints[key] = {
          status: 'ok',
          responseTime: Date.now() - startTime,
          statusCode: response.status
        };
      } catch (err) {
        results.endpoints[key] = {
          status: 'error',
          responseTime: Date.now() - startTime,
          error: err.message,
          statusCode: err.response?.status || 'N/A'
        };
      }
    }

    return results;
  }

  /**
   * Get comprehensive system status
   */
  async getSystemStatus() {
    const healthCheck = await this.checkHealth();
    const endpointCheck = await this.checkCriticalEndpoints();

    const failedEndpoints = Object.entries(endpointCheck.endpoints)
      .filter(([, result]) => result.status !== 'ok')
      .length;

    return {
      provider: this.name,
      overallStatus: healthCheck.status === 'online' && failedEndpoints === 0 ? 'healthy' : 'degraded',
      health: healthCheck,
      endpoints: endpointCheck.endpoints,
      failedEndpoints,
      timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
    };
  }
}

/**
 * Extension: Health Check methods for ProviderAdapterFactory
 */
ProviderAdapterFactory.checkAllProviders = async function() {
  const results = {
    timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false }),
    providers: {},
    summary: {
      healthy: 0,
      degraded: 0,
      offline: 0
    }
  };

  for (const providerName of Object.keys(providerConfigs)) {
    try {
      const adapter = ProviderAdapterFactory.createAdapter(providerName);
      const status = await adapter.getSystemStatus();
      results.providers[providerName] = status;

      // Update summary
      if (status.overallStatus === 'healthy') {
        results.summary.healthy++;
      } else if (status.overallStatus === 'degraded') {
        results.summary.degraded++;
      } else {
        results.summary.offline++;
      }
    } catch (err) {
      results.providers[providerName] = {
        provider: providerName,
        overallStatus: 'error',
        error: err.message,
        timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
      };
      results.summary.offline++;
    }
  }

  results.systemHealth = results.summary.offline === 0 ? 'operational' : 'warning';
  return results;
};

module.exports = {
  providerConfigs,
  ProviderAdapterFactory,
  ProviderAdapter
};
