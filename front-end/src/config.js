/**
 * API Configuration - Service-Specific URLs
 * 
 * Αρχιτεκτονική:
 * Κάθε microservice έχει το δικό του URL για απευθείας επικοινωνία
 */

// Service-Specific URLs (matching docker-compose.yml ports)
export const SERVICES = {
  providers: 'http://127.0.0.1:3105/api',      // Provider Management Service (UC03) - PORT 3105
  analytics: 'http://127.0.0.1:3102/api',      // Analytics Service (UC04, UC06) - PORT 3102
  billing: 'http://127.0.0.1:3103/api',        // Billing Service (UC05) - PORT 3103
  reservations: 'http://127.0.0.1:3106/api',     // Reservation Service (UC01) - PORT 3106
  points: 'http://127.0.0.1:3001/api'        // Points Service (central) - PORT 3001
};

// Legacy fallback (για backward compatibility)
export const BASE_URL = "http://127.0.0.1:9876/api";

/**
 * Get service URL by service name
 * @param {string} serviceName - 'providers', 'analytics', 'billing', 'reservations'
 * @returns {string} Service URL
 */
export const getServiceURL = (serviceName) => {
  return SERVICES[serviceName] || BASE_URL;
};

/**
 * API Timeout Configuration
 */
export const API_CONFIG = {
  timeout: 10000, // 10 seconds
  retries: 3,
  retryDelay: 1000 // milliseconds
};

/**
 * Authentication Headers Helper
 */
export const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json'
    }
  };
};