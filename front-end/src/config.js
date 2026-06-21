/**
 * API Configuration - Service-Specific URLs
 * 
 * Αρχιτεκτονική:
 * Κάθε microservice έχει το δικό του URL για απευθείας επικοινωνία
 */

// Base URL for the API gateway. Can be overridden with VITE_API_BASE_URL.
const DEFAULT_API_BASE_URL = import.meta.env.DEV ? '/api' : 'http://127.0.0.1:8001/api';

const normalizeApiBase = (base) => base.replace(/\/+$/, '');

const unique = (values) => [...new Set(values.filter(Boolean))];

const getRuntimeApiBaseCandidates = () => {
  if (typeof window === 'undefined') {
    return [DEFAULT_API_BASE_URL];
  }

  // In development, route through Vite proxy to avoid host/port mismatches.
  if (import.meta.env.DEV) {
    return ['/api'];
  }

  const { protocol, hostname } = window.location;
  const candidates = [
    `${protocol}//${hostname}:8001/api`,
    `${protocol}//${hostname}:8000/api`
  ];

  // Always include loopback fallbacks because backend services are often bound
  // only to localhost while Vite may be opened via LAN host/IP.
  candidates.push(
    'http://127.0.0.1:8001/api',
    'http://127.0.0.1:8000/api',
    'http://localhost:8001/api',
    'http://localhost:8000/api'
  );

  candidates.push(DEFAULT_API_BASE_URL);
  return unique(candidates.map(normalizeApiBase));
};

const envApiBase = import.meta.env.VITE_API_BASE_URL
  ? normalizeApiBase(import.meta.env.VITE_API_BASE_URL)
  : null;

export const API_BASE_CANDIDATES = envApiBase
  ? [envApiBase]
  : getRuntimeApiBaseCandidates();

export const BASE_URL = API_BASE_CANDIDATES[0] || DEFAULT_API_BASE_URL;

const SERVICE_PATHS = {
  auth: '/auth',
  providers: '/providers',
  analytics: '/analytics',
  billing: '/billing',
  reservations: '/reservations',
  points: '/points'
};

// Service-Specific URLs (matching docker-compose.yml ports or runtime override)
export const SERVICES = {
  auth: `${BASE_URL}${SERVICE_PATHS.auth}`,           // Auth Service via API Gateway
  providers: `${BASE_URL}${SERVICE_PATHS.providers}`, // Provider Management via API Gateway
  analytics: `${BASE_URL}${SERVICE_PATHS.analytics}`, // Analytics via API Gateway
  billing: `${BASE_URL}${SERVICE_PATHS.billing}`,     // Billing via API Gateway
  reservations: `${BASE_URL}${SERVICE_PATHS.reservations}`, // Reservation via API Gateway
  points: `${BASE_URL}${SERVICE_PATHS.points}`        // Points Service (central) - via API Gateway
};

/**
 * Get service URL by service name
 * @param {string} serviceName - 'providers', 'analytics', 'billing', 'reservations'
 * @returns {string} Service URL
 */
export const getServiceURL = (serviceName) => {
  return SERVICES[serviceName] || BASE_URL;
};

export const getServiceURLCandidates = (serviceName) => {
  const servicePath = SERVICE_PATHS[serviceName] || '';
  return API_BASE_CANDIDATES.map((base) => `${base}${servicePath}`);
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