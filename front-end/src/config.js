/**
 * API Configuration - Service-Specific URLs
 * 
 * Αρχιτεκτονική:
 * Κάθε microservice έχει το δικό του URL για απευθείας επικοινωνία
 */

// Base URL for the API gateway. Can be overridden with VITE_API_BASE_URL.
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8001/api';
export const BASE_URL = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;

// Service-Specific URLs (matching docker-compose.yml ports or runtime override)
export const SERVICES = {
  auth: `${BASE_URL}/auth`,           // Auth Service via API Gateway
  providers: `${BASE_URL}/providers`, // Provider Management via API Gateway
  analytics: `${BASE_URL}/analytics`, // Analytics via API Gateway
  billing: `${BASE_URL}/billing`,     // Billing via API Gateway
  reservations: `${BASE_URL}/reservations`, // Reservation via API Gateway
  points: `${BASE_URL}/points`        // Points Service (central) - via API Gateway
};

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