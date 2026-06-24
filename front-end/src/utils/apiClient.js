/**
 * API Client Utility
 * 
 * Κεντρικό σημείο για όλες τις API κλήσεις προς τα 4 microservices
 * Χειρίζεται:
 * - Authentication headers
 * - Error handling
 * - Response normalization
 * - Retry logic
 */

import axios from 'axios';
import { BASE_URL, SERVICES, API_CONFIG, getAuthHeaders } from '../config';

/**
 * Create axios instance με configuration
 */
const createApiInstance = (baseURL) => {
  return axios.create({
    baseURL,
    timeout: API_CONFIG.timeout,
    headers: {
      'Content-Type': 'application/json'
    }
  });
};

/**
 * Provider Management Service API
 * UC03: Provider Registration & Management
 */
export const providerAPI = {
  /**
   * POST /api/providers/register
   * Εγγραφή νέου provider
   */
  register: async (providerData) => {
    try {
      const api = createApiInstance(SERVICES.providers);
      const response = await api.post('/register', providerData, getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      const details = error.response?.data?.details;
      return {
        success: false,
        error: Array.isArray(details)
          ? details.join(' | ')
          : error.response?.data?.error || error.response?.data?.message || error.message
      };
    }
  },

  /**
   * GET /api/providers
   * Λήψη όλων των providers
   */
  getAll: async () => {
    try {
      const api = createApiInstance(SERVICES.providers);
      const response = await api.get('', getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        data: []
      };
    }
  },

  /**
   * GET /api/providers/:providerId
   * Λήψη λεπτομερειών provider
   */
  getById: async (providerId) => {
    try {
      const api = createApiInstance(SERVICES.providers);
      const response = await api.get(`/${providerId}`, getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || error.response?.data?.message || error.message
      };
    }
  },

  /**
   * POST /api/providers/:providerId/suspend
   * Αναστολή provider
   */
  suspend: async (providerId, reason) => {
    try {
      const api = createApiInstance(SERVICES.providers);
      const response = await api.post(`/${providerId}/suspend`, { reason }, getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }
};

/**
 * Analytics Service API
 * UC04: Analytics & Reports
 */
export const analyticsAPI = {
  /**
   * GET /api/analytics/providers/:providerId
   * Provider KPI metrics from Analytics Service.
   */
  getProviderAnalytics: async (providerId) => {
    try {
      const api = createApiInstance(SERVICES.analytics);
      const response = await api.get(`/providers/${providerId}`, getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        data: {}
      };
    }
  },

  /**
   * GET /api/analytics/providers/:providerId/timeseries
   * Provider six-month reservation and user timeseries.
   */
  getProviderTimeseries: async (providerId) => {
    try {
      const api = createApiInstance(SERVICES.analytics);
      const response = await api.get(`/providers/${providerId}/timeseries`, getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        data: {}
      };
    }
  },

  /**
   * Legacy alias kept for older screens.
   */
  getDailyAnalytics: async (providerId) => {
    return analyticsAPI.getProviderTimeseries(providerId);
  },

  /**
   * UC08: Export provider logs
   * GET /api/analytics/providers/:providerId/export
   * Downloads activity logs as CSV or JSON
   */
  exportLogs: async (providerId, format = 'csv', startDate, endDate) => {
    try {
      const api = createApiInstance(SERVICES.analytics);
      const params = new URLSearchParams({
        format,
        ...(startDate && { startDate }),
        ...(endDate && { endDate })
      }).toString();
      
      const response = await api.get(
        `/providers/${providerId}/export?${params}`,
        {
          ...getAuthHeaders(),
          responseType: format === 'csv' ? 'blob' : 'json'
        }
      );
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * UC04 Extension: Request invoice generation
   * POST /api/analytics/provider/:providerId/request-invoice
   */
  requestInvoice: async (providerId, period = 'monthly', startDate, endDate) => {
    try {
      const api = createApiInstance(SERVICES.analytics);
      const response = await api.post(
        `/providers/${providerId}/request-invoice`,
        {
          period,
          ...(startDate && { startDate }),
          ...(endDate && { endDate })
        },
        getAuthHeaders()
      );
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * GET /api/analytics/global?period=monthly
   * Λήψη συνολικών analytics του συστήματος
   */
  getGlobalAnalytics: async (period = 'monthly') => {
    try {
      const api = createApiInstance(SERVICES.analytics);
      const response = await api.get(`/global?period=${period}`, getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        data: {}
      };
    }
  },

  /**
   * GET /api/analytics/global/timeseries
   * Operator six-month analytics.
   */
  getGlobalTimeseries: async () => {
    try {
      const api = createApiInstance(SERVICES.analytics);
      const response = await api.get('/global/timeseries', getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        data: {}
      };
    }
  },

  /**
   * GET /api/analytics/global/rankings
   * Operator provider rankings.
   */
  getGlobalRankings: async () => {
    try {
      const api = createApiInstance(SERVICES.analytics);
      const response = await api.get('/global/rankings', getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        data: {}
      };
    }
  },

  /**
   * GET /health
   * Health check
   */
  health: async () => {
    try {
      const api = createApiInstance(SERVICES.analytics);
      const response = await api.get('/health');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};

/**
 * Billing Service API
 * UC05: Invoicing & Billing
 */
export const billingAPI = {
  /**
   * GET /api/billing/invoice/:providerId
   * Λήψη τρέχοντος invoice για provider
   */
  getInvoice: async (providerId) => {
    try {
      const api = createApiInstance(SERVICES.billing);
      const response = await api.get(`/invoice/${providerId}`, getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * GET /api/billing/invoices/:providerId?limit=12
   * Λήψη ιστορικού invoices
   */
  getInvoiceHistory: async (providerId, limit = 12) => {
    try {
      const api = createApiInstance(SERVICES.billing);
      const response = await api.get(`/invoices/${providerId}?limit=${limit}`, getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        data: []
      };
    }
  },

  /**
   * POST /api/billing/invoices/:providerId/:invoiceId/mark-paid
   * Σήμανση invoice ως πληρωμένου (legacy endpoint)
   */
  markInvoiceAsPaid: async (providerId, invoiceId) => {
    try {
      const api = createApiInstance(SERVICES.billing);
      const response = await api.post(`/invoices/${providerId}/${invoiceId}/mark-paid`, {}, getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * UC07: Process payment for invoice
   * POST /api/billing/invoices/:providerId/:invoiceId/pay
   */
  processPayment: async (providerId, invoiceId, paymentData) => {
    try {
      const api = createApiInstance(SERVICES.billing);
      const response = await api.post(
        `/invoices/${providerId}/${invoiceId}/pay`,
        paymentData || { paymentMethod: 'bank_transfer' },
        getAuthHeaders()
      );
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * UC07: Get payment history
   * GET /api/billing/provider/:providerId/payments
   */
  getPaymentHistory: async (providerId, limit = 50) => {
    try {
      const api = createApiInstance(SERVICES.billing);
      const response = await api.get(
        `/provider/${providerId}/payments?limit=${limit}`,
        getAuthHeaders()
      );
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        data: []
      };
    }
  },

  /**
   * Get all outstanding invoices
   * GET /api/billing/outstanding/:providerId
   */
  getOutstandingInvoices: async (providerId) => {
    try {
      const api = createApiInstance(SERVICES.billing);
      const response = await api.get(
        `/outstanding/${providerId}`,
        getAuthHeaders()
      );
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        data: { invoices: [] }
      };
    }
  },

  /**
   * GET /api/billing/summary/:providerId
   * Λήψη περίληψης billing
   */
  getSummary: async (providerId) => {
    try {
      const api = createApiInstance(SERVICES.billing);
      const response = await api.get(`/summary/${providerId}`, getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        data: {}
      };
    }
  },

  /**
   * GET /health
   * Health check
   */
  health: async () => {
    try {
      const api = createApiInstance(SERVICES.billing);
      const response = await api.get('/health');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};

/**
 * Points Service API (via Reservation Service)
 * Unified endpoint για λήψη όλων των σημείων φόρτισης από όλους τους providers
 */
export const pointsAPI = {
  /**
   * GET /api/points
   * Λήψη όλων των σημείων φόρτισης από τους adapters
   */
  getAll: async (params = {}) => {
    try {
      const api = createApiInstance(SERVICES.points);
      const response = await api.get('', {
        ...getAuthHeaders(),
        params
      });
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        data: { points: [] }
      };
    }
  },

  /**
   * GET /api/points/:pointId
   * Λήψη ενός σημείου φόρτισης για ανανέωση marker μετά από reservation
   */
  getById: async (pointId) => {
    try {
      const api = createApiInstance(SERVICES.points);
      const response = await api.get(`/${pointId}`, getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || error.response?.data?.message || error.message,
        data: null
      };
    }
  }
};

/**
 * Reservation Service API
 * Unified endpoint για κράτηση σημείων φόρτισης
 */
export const reservationAPI = {
  /**
   * POST /api/reserve
   * Κράτηση σημείου φόρτισης
   * 
   * Το endpoint αυτό υποστηρίζει όλους τους providers:
   * - redPlug
   * - greenPlug
   * - bluePlug
   */
  createReservation: async (reservationData) => {
    try {
      const api = createApiInstance(BASE_URL);
      const response = await api.post('/reserve', reservationData, getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || error.response?.data?.message || error.message
      };
    }
  },

  /**
   * GET /api/reservations
   * Λήψη όλων των κρατήσεων
   */
  getAll: async () => {
    try {
      const api = createApiInstance(SERVICES.reservations);
      const response = await api.get('', getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        data: []
      };
    }
  },

  /**
   * GET /api/reservations/:reservationId
   * Λήψη λεπτομερειών κράτησης
   */
  getById: async (reservationId) => {
    try {
      const api = createApiInstance(SERVICES.reservations);
      const response = await api.get(`/${reservationId}`, getAuthHeaders());
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * GET /health
   * Health check
   */
  health: async () => {
    try {
      const api = createApiInstance(SERVICES.reservations);
      const response = await api.get('/health');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};

/**
 * Unified API export
 */
export const apiClient = {
  providers: providerAPI,
  analytics: analyticsAPI,
  billing: billingAPI,
  reservations: reservationAPI,
  points: pointsAPI
};

export default apiClient;
