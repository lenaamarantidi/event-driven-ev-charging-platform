/**
 * API Configuration - Service-Specific URLs
 * 
 * Αρχιτεκτονική:
 * Κάθε microservice έχει το δικό του URL για απευθείας επικοινωνία
 */

// Service-Specific URLs
export const SERVICES = {
  auth: 'http://127.0.0.1:8001/api/auth',           // Auth Service via API Gateway
  providers: 'http://127.0.0.1:8001/api/providers', // Provider Management via API Gateway
  analytics: 'http://127.0.0.1:8001/api/analytics', // Analytics via API Gateway
  billing: 'http://127.0.0.1:8001/api/billing',     // Billing via API Gateway
  reservations: 'http://127.0.0.1:8001/api/reservations' // Reservation via API Gateway
};

// Legacy fallback (για backward compatibility)
export const BASE_URL = "http://127.0.0.1:8001/api"; 

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