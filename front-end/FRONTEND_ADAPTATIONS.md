# Frontend UI Adaptations - UC01, UC03/UC04/UC08, UC06

## Overview
This document describes the frontend UI adaptations implemented for the SaaS EV charging platform covering three major use cases:

- **UC01**: EV User Map & Search Interface
- **UC03, UC04, UC08**: Provider Dashboard 
- **UC06**: System Operator Dashboard

---

## Architecture

### Role-Based Routing System
The application now implements a comprehensive role-based access control system with the following user types:

1. **EV User** (UC01) - Drivers finding and booking charging stations
2. **Provider** (UC03, UC04, UC08) - Charging network operators
3. **Operator** (UC06) - System administrator overseeing the entire network
4. **Admin** - Full platform administrator (future expansion)

### Authentication Flow
```
Login/Signup (Auth.jsx)
    ↓
Role Selection (RoleSelect.jsx)
    ↓
Role-Specific Dashboard (App.jsx routing)
```

---

## Use Case 1: UC01 - EV User Map & Search

### File: `src/pages/EVUserMap.jsx`

#### Key Features:
1. **Interactive Map View**
   - Real-time location-based charging point discovery
   - Marker clustering for better UX at different zoom levels
   - Color-coded markers:
     - 🟢 Green: Available outlets
     - 🟣 Violet: Booked by user
     - 🔴 Red: Occupied/Reserved
     - ⚫ Gray: Offline/Maintenance
     - 🟠 Orange: Selected station

2. **Advanced Search & Filtering**
   - Geolocation search using Nominatim API
   - Distance-based filtering (0-100km)
   - Price range filtering (€/kWh)
   - Power output filtering (0-350 kW)
   - Charger type filtering (AC/DC)
   - Connector type filtering (Type 2, CCS, CHAdeMO, etc.)
   - Availability status filtering

3. **Responsive Design**
   - Desktop: Side-by-side map and info panels
   - Mobile: Collapsible sidebar, bottom sheet info panel
   - Adaptive UI switches at 768px breakpoint

4. **Charger Information Panel**
   - Real-time availability status
   - Pricing information per outlet
   - Outlet specifications (connector type, power)
   - Distance calculation using Haversine formula
   - Quick booking interface

5. **Navigation Features**
   - GPS-based location detection
   - Address search with fallback to default (Athens, Greece)
   - Smooth map animations
   - Error handling for location permissions

#### Components Used:
- `MapView.jsx` - Leaflet-based interactive map with marker clustering
- `InfoPanel.jsx` - Station details and booking interface
- `Sidebar.jsx` - Filter controls and user menu
- `RoleSelect.jsx` - User role selection interface

#### API Endpoints Called:
- `GET /api/ui/locations` - Fetch charging points with geospatial filtering
- `POST /api/auth/login` - User authentication
- `GET /api/auth/profile` - User profile data

---

## Use Case 2: UC03, UC04, UC08 - Provider Dashboard

### File: `src/pages/ProviderDashboard.jsx`

#### Key Features:
1. **Dashboard Overview**
   - Real-time KPIs displayed as metric cards:
     - Total Stations
     - Active Stations (online/operational)
     - Total Reservations (cumulative bookings)
     - Monthly Revenue
     - Network Utilization Rate

2. **Stations Management**
   - View all charging stations in the network
   - Station status monitoring (Active/Maintenance)
   - Real-time outlet availability tracking
   - Utilization percentage per station
   - Quick actions: Add new station, view details
   - Modal view for detailed station information

3. **Reservations Tracking**
   - Table view of all reservations
   - Booking date and time
   - User identifiers
   - Booking duration
   - Revenue generated per reservation
   - Status indicators (Completed/In Progress)

4. **Reports & Analytics**
   - Monthly revenue tracking
   - Weekly average calculations
   - Session statistics:
     - Total sessions count
     - Average session duration
   - Revenue trends and patterns

5. **Quick Actions Panel**
   - Add new charging station
   - View comprehensive reports
   - Access settings/configuration

#### Tab Navigation:
- 📊 Overview - Dashboard home with KPIs
- ⚡ Stations - Station management and monitoring
- 📅 Reservations - Booking history and tracking
- 📈 Reports - Analytics and revenue reporting

#### Components:
- `StatCard.jsx` - Reusable metric display component
- Tabbed navigation for section organization
- Modal dialogs for detailed views
- Responsive table for reservations list

#### API Endpoints:
- `GET /api/provider/stations` - Fetch provider's stations
- `GET /api/provider/analytics` - Get provider analytics
- `GET /api/provider/reservations` - Fetch reservation history

---

## Use Case 3: UC06 - System Operator Dashboard

### File: `src/pages/OperatorDashboard.jsx`

#### Key Features:
1. **System Overview**
   - Network-wide KPIs:
     - Total active providers
     - Total stations across network
     - Active stations count
     - Registered users total
     - System utilization percentage
     - Total transactions (monthly)
   - Trend indicators (upward/downward arrows)

2. **System Health Monitoring**
   - Network performance metrics (99.8%+)
   - API response time monitoring
   - Database load indicators
   - Visual progress bars for each metric

3. **Provider Management**
   - Table view of all providers
   - Provider status (Active/Inactive)
   - Provider metrics:
     - Number of stations
     - User count
     - Monthly revenue
     - Last sync timestamp
   - Actions: View provider details, manage

4. **Alerts & Monitoring**
   - Real-time system alerts
   - Severity levels:
     - 🔴 Critical - Immediate attention needed
     - 🟡 Warning - Requires review
     - 🔵 Info - Informational messages
   - Alert history and timeline
   - Alert summary counts

5. **System Reports**
   - Revenue aggregation across all providers
   - Network statistics and metrics
   - User growth tracking
   - Provider performance scoring
   - Service quality metrics (98.5% availability)
   - User growth analysis (new users, active users)

6. **Metrics & Analytics**
   - System revenue trends
   - Total charging sessions
   - Average session duration
   - New user acquisitions
   - Provider performance averages

#### Tab Navigation:
- 📊 System Overview - Main dashboard with system health
- 🏢 Providers - Provider management and monitoring
- ⚠️ Alerts & Monitoring - System alerts and health checks
- 📈 System Reports - Analytics and business intelligence

#### Components:
- `MetricCard.jsx` - System-wide KPI display
- `AlertItem.jsx` - Alert notification component
- Alert severity indicators
- Provider management table
- System health progress indicators

#### API Endpoints:
- `GET /api/operator/metrics` - System-wide metrics
- `GET /api/operator/providers` - List of all providers
- `GET /api/operator/alerts` - System alerts and notifications

---

## Technical Implementation

### File Structure
```
front-end/
├── src/
│   ├── pages/
│   │   ├── Home.jsx (Legacy fallback)
│   │   ├── EVUserMap.jsx (UC01)
│   │   ├── ProviderDashboard.jsx (UC03/UC04/UC08)
│   │   └── OperatorDashboard.jsx (UC06)
│   ├── components/
│   │   ├── Auth.jsx (Authentication)
│   │   ├── RoleSelect.jsx (Role selection)
│   │   ├── MapView.jsx (Map rendering)
│   │   ├── InfoPanel.jsx (Station details)
│   │   ├── Sidebar.jsx (Filters)
│   │   └── Account.jsx (User account)
│   ├── App.jsx (Main routing)
│   └── config.js (API configuration)
```

### Routing Logic
```javascript
// app/App.jsx
if (!token) → Auth component
if (token && !role) → RoleSelect component
if (role === 'ev_user') → EVUserMap page
if (role === 'provider') → ProviderDashboard page
if (role === 'operator') → OperatorDashboard page
```

### State Management
- **React hooks** for local state management
- **localStorage** for persistence:
  - `token` - Authentication token
  - `username` - Logged-in user
  - `userRole` - Selected user role
- **axios** for API communication

### Responsive Design
- **Mobile-first approach** for UC01 (EV User Map)
- **Adaptive layouts** switching at 768px breakpoint
- **Collapsible sidebars** for mobile screens
- **Bottom sheets** for mobile info panels
- **Touch-friendly** button sizes and spacing

### Data Normalization
The `EVUserMap` component normalizes charging point data from providers:
```javascript
{
  pointid: string,
  lat: float,
  lon: float,
  name: string,
  address: string,
  connector_types: array,
  kwhprice: number,
  cap: number,
  distance: number,
  outlets: array
}
```

### Error Handling
- GPS permission denial with fallback location
- Geolocation timeout handling
- API error notifications
- Invalid search results feedback
- Network error recovery

---

## Color Scheme & Visual Design

### EV User Map (UC01)
- Primary: #7c3aed (Purple - Violet accent)
- Success: #10b981 (Green - Available)
- Danger: #ef4444 (Red - Occupied)
- Warning: #f59e0b (Orange - Selected)
- Dark theme for sidebar: #2d1f47

### Provider Dashboard (UC03/UC04/UC08)
- Light theme with card-based layout
- Color-coded status badges
- Blue borders for metric cards
- Success/Warning/Info color indicators
- Hover effects for interactivity

### Operator Dashboard (UC06)
- Professional dark header
- Light content background
- Severity-based alert colors
- Trend indicators with directional arrows
- Performance bars with color coding

---

## Features Summary

| Feature | UC01 | UC03/UC04/UC08 | UC06 |
|---------|------|---|---|
| Real-time Map | ✅ | - | - |
| Station Search | ✅ | - | - |
| Advanced Filters | ✅ | - | - |
| Station Management | - | ✅ | ✅ |
| Revenue Tracking | - | ✅ | ✅ |
| Analytics | - | ✅ | ✅ |
| Reservation History | - | ✅ | - |
| Provider Monitoring | - | - | ✅ |
| System Alerts | - | - | ✅ |
| Health Monitoring | - | - | ✅ |
| User Management | - | - | ✅ |

---

## API Integration

### Base URL Configuration
```javascript
// src/config.js
export const BASE_URL = "http://127.0.0.1:9876/api";
```

---

## API Integration - Updated Microservices Architecture

### Configuration Structure
```javascript
// src/config.js
export const SERVICES = {
  providers: 'http://127.0.0.1:3105/api',    // Provider Management Service (UC03)
  analytics: 'http://127.0.0.1:3102/api',    // Analytics Service (UC04)
  billing: 'http://127.0.0.1:3103/api',      // Billing Service (UC05)
  reservations: 'http://127.0.0.1:3106/api'  // Reservation Service (UC01 - unified)
};
```

### API Client Organization
```
src/utils/
├── apiClient.js              # Centralized API client for all 4 services
├── providerDataMapper.js     # Anti-corruption layer for provider normalization
└── (implicitly: config.js)
```

### Unified API Endpoints

#### 1. Reservation Service (Port 3106) - UC01
**Purpose**: Unified reservation endpoint for all providers (redPlug, greenPlug, bluePlug)

**Endpoints**:
```
POST   /api/reserve              # Create reservation (unified for all providers)
GET    /api/reservations         # List all reservations
GET    /api/reservations/:id     # Get specific reservation details
GET    /health                   # Health check
```

**Usage in EVUserMap.jsx**:
```javascript
import { reservationAPI } from '../utils/apiClient';

// Get all reservations/points
const result = await reservationAPI.getAll();

// Create new reservation
const result = await reservationAPI.createReservation({
  providerName: 'redPlug',      // or 'greenPlug', 'bluePlug'
  pointId: '123',
  duration: 120,                 // minutes
  userId: 'user123'
});
```

**Response Normalization** (via ProviderDataMapper):
```javascript
import ProviderDataMapper from '../utils/providerDataMapper';

// Auto-normalize from any provider format
const unified = ProviderDataMapper.normalizePoint(providerData, 'redPlug');

// Returns UnifiedPoint:
{
  unifiedPointId,
  providerName,
  currentStatus,
  reservationEndTime,
  pricePerKwh,
  coordinates: { longitude, latitude }
}
```

#### 2. Provider Management Service (Port 3105) - UC03
**Purpose**: Provider registration and management

**Endpoints**:
```
POST   /api/providers/register   # Register new EV provider
GET    /api/providers            # List all providers
GET    /api/providers/:id        # Get provider details
POST   /api/providers/:id/suspend # Suspend provider
```

**Usage in OperatorDashboard.jsx**:
```javascript
import { providerAPI } from '../utils/apiClient';

// Register new provider
const result = await providerAPI.register({
  provider_name: 'NewProvider',
  base_url: 'https://api.newprovider.com',
  api_key: 'secret-key-123',
  endpoint_list_points: '/points',
  endpoint_point_details: '/points/:id',
  endpoint_reserve: '/reserve',
  endpoint_reserve_duration: '/reserve/duration'
});

// Get all providers
const providers = await providerAPI.getAll();

// Get specific provider
const provider = await providerAPI.getById(providerId);
```

#### 3. Analytics Service (Port 3102) - UC04
**Purpose**: Provider analytics and system-wide metrics

**Endpoints**:
```
GET    /api/analytics/provider/:providerId?period=monthly&from=DATE&to=DATE
GET    /api/analytics/provider/:providerId/daily
GET    /api/analytics/global?period=monthly
GET    /health
```

**Usage in ProviderDashboard.jsx**:
```javascript
import { analyticsAPI } from '../utils/apiClient';

// Provider-specific analytics (monthly)
const analytics = await analyticsAPI.getProviderAnalytics(providerId, { 
  period: 'monthly',
  from: '2024-01-01',
  to: '2024-01-31'
});

// Provider daily analytics
const daily = await analyticsAPI.getDailyAnalytics(providerId);

// System-wide analytics (for Operator)
const global = await analyticsAPI.getGlobalAnalytics('monthly');
```

**Usage in OperatorDashboard.jsx**:
```javascript
import { analyticsAPI } from '../utils/apiClient';

// Get global system metrics
const metrics = await analyticsAPI.getGlobalAnalytics('monthly');
```

**Response Structure**:
```javascript
{
  provider_id: 123,
  period: 'monthly',
  date_range: { from: '2024-01-01', to: '2024-01-31' },
  stats: {
    searches: 150,
    point_views: 320,
    reservations: 45
  },
  daily_data: [...]
}
```

#### 4. Billing Service (Port 3103) - UC05
**Purpose**: Invoice generation and billing management

**Endpoints**:
```
GET    /api/billing/invoice/:providerId
GET    /api/billing/invoices/:providerId?limit=12
POST   /api/billing/invoices/:providerId/:invoiceId/mark-paid
GET    /api/billing/summary/:providerId
GET    /health
```

**Usage in ProviderDashboard.jsx**:
```javascript
import { billingAPI } from '../utils/apiClient';

// Get current month invoice
const invoice = await billingAPI.getInvoice(providerId);

// Get invoice history (last 12)
const history = await billingAPI.getInvoiceHistory(providerId, 12);

// Mark invoice as paid
const result = await billingAPI.markInvoiceAsPaid(providerId, invoiceId);

// Get billing summary
const summary = await billingAPI.getSummary(providerId);
```

**Response Structure**:
```javascript
{
  invoice_id: 'INV-2024-001',
  provider_id: 123,
  billing_period_start: '2024-01-01',
  billing_period_end: '2024-01-31',
  total_amount: 1500.50,
  tax_amount: 315.10,
  grand_total: 1815.60,
  due_date: '2024-02-28',
  event_count: 45,
  status: 'draft'
}
```

---

## Microservice Configuration

### Environment Variables (for backend)
```env
# Provider Management Service
PROVIDER_MANAGEMENT_PORT=3105
PROVIDER_MANAGEMENT_DB=providers_db

# Analytics Service
ANALYTICS_PORT=3102
ANALYTICS_DB=analytics_db

# Billing Service
BILLING_PORT=3103
BILLING_DB=billing_db

# Reservation Service
RESERVATION_PORT=3106
RESERVATION_DB=reservations_db
REDPLUG_BASE_URL=http://localhost:8001
GREENPLUG_BASE_URL=http://localhost:8002
BLUEPLUG_BASE_URL=http://localhost:8003
```

---

## Frontend State Management

### Provider Context (future enhancement)
```javascript
// Redux or Context API for global state
{
  auth: { token, userId, userRole },
  provider: { providerId, name, analytics },
  system: { globalMetrics, alerts },
  reservations: { list, selected },
  ui: { loading, error }
}
```

---

## Error Handling & Fallbacks

### API Client Error Handling
```javascript
// All API calls return:
{
  success: boolean,
  data: object | array,
  error?: string
}

// Usage:
const result = await analyticsAPI.getProviderAnalytics(providerId);
if (!result.success) {
  console.error('Analytics error:', result.error);
  // Show user-friendly error message
}
```

### Retry Logic (implemented in apiClient.js)
- Timeout: 10 seconds
- Retries: 3 attempts
- Delay between retries: 1 second

---

## Compatibility Verification

### Architecture Alignment ✅
- **Event-driven architecture**: ✅ RabbitMQ integration in backend
- **Async communication**: ✅ Message broker patterns
- **Database**: ✅ MariaDB (NOT SQLite)
- **Microservices**: ✅ 4 independent services with defined contracts
- **Anti-corruption layer**: ✅ ProviderDataMapper normalizes heterogeneous APIs

### Role-Based Access Control ✅
- **ev_user**: Can search, filter, and reserve charging points
- **provider**: Can view analytics, billing, and manage stations
- **operator**: Can view global metrics, manage providers, monitor system
- **admin**: Full platform access (future)

### API Endpoint Compatibility ✅
- EVUserMap (UC01): Reservation Service `/api/reserve` ✅
- ProviderDashboard (UC03/04/08):
  - Analytics Service `/api/analytics/provider/:providerId` ✅
  - Billing Service `/api/billing/summary/:providerId` ✅
- OperatorDashboard (UC06):
  - Analytics Service `/api/analytics/global` ✅
  - Provider Management `/api/providers` ✅

### Data Flow Verification ✅
```
Frontend
  ↓ UC01 (EV User)
Reservation Service (3106)
  ↓ Creates reservation
Event Broker (RabbitMQ)
  ├→ Analytics Service (3102) - tracks events
  ├→ Billing Service (3103) - generates charges
  └→ Provider adapters - calls external APIs
```

---

## Previous Endpoints (Deprecated)

### Legacy API Gateway (Port 9876)
The following endpoints are **NO LONGER USED** and have been replaced:

```javascript
// OLD - DO NOT USE
GET    /api/ui/locations           → NOW: GET /api/reservations (Reservation Service 3106)
GET    /api/provider/stations      → NOW: GET /api/analytics/provider/:id/daily (Analytics Service 3102)
GET    /api/provider/analytics     → NOW: GET /api/analytics/provider/:id (Analytics Service 3102)
GET    /api/provider/reservations  → NOW: GET /api/reservations (Reservation Service 3106)
GET    /api/operator/metrics       → NOW: GET /api/analytics/global (Analytics Service 3102)
GET    /api/operator/providers     → NOW: GET /api/providers (Provider Management 3105)
GET    /api/operator/alerts        → NOW: Simulated in OperatorDashboard.jsx
POST   /api/auth/login             → Auth Service (separate, existing)
```

---

## Implementation Summary

✅ **config.js** - Updated with service-specific URLs
✅ **utils/apiClient.js** - New centralized API client
✅ **utils/providerDataMapper.js** - Anti-corruption layer wrapper
✅ **EVUserMap.jsx** - Updated to use Reservation Service
✅ **ProviderDashboard.jsx** - Updated to use Analytics & Billing Services
✅ **OperatorDashboard.jsx** - Updated to use Analytics & Provider Management
✅ **FRONTEND_ADAPTATIONS.md** - This document

---

## Testing Checklist

- [ ] Start all 4 microservices
- [ ] Test EVUserMap - verify reservations load
- [ ] Test ProviderDashboard - verify analytics and billing data
- [ ] Test OperatorDashboard - verify global metrics and provider list
- [ ] Verify error handling for service timeouts
- [ ] Verify data normalization from different providers
- [ ] Test authentication headers with bearer tokens
- [ ] Verify responsive design (mobile & desktop)
- [ ] Test API fallbacks and error states

---
```
GET /api/ui/locations?lat=37.97&lon=23.73&max_distance_km=50
POST /api/auth/login
GET /api/auth/profile
```

#### UC03/UC04/UC08 (Provider Dashboard)
```
GET /api/provider/stations
GET /api/provider/analytics
GET /api/provider/reservations
```

#### UC06 (Operator Dashboard)
```
GET /api/operator/metrics
GET /api/operator/providers
GET /api/operator/alerts
```

---

## How to Use

### 1. Running the Frontend
```bash
cd front-end
npm install
npm run dev
```

### 2. Initial Login
- Access `http://localhost:5173`
- Login with valid credentials
- Select your role from the role selector

### 3. Role Navigation
Users can log out and select a different role to switch between dashboards without re-authenticating.

### 4. Responsive Testing
- Desktop: Open browser at normal width
- Tablet: Resize to ~900px
- Mobile: Resize to ~375px

---

## Future Enhancements

### UC01 Enhancements
- [ ] Route planning to nearest charger
- [ ] Real-time charging session tracking
- [ ] Payment method management
- [ ] User history and bookmarks
- [ ] Provider ratings and reviews
- [ ] Queue management for busy chargers

### UC03/UC04/UC08 Enhancements
- [ ] Predictive maintenance alerts
- [ ] Dynamic pricing controls
- [ ] Advanced revenue analytics
- [ ] Staff management interface
- [ ] Inventory tracking for connectors
- [ ] Customer feedback analysis

### UC06 Enhancements
- [ ] SLA monitoring for providers
- [ ] Compliance reporting
- [ ] Dispute resolution interface
- [ ] System configuration panel
- [ ] Custom alert rules
- [ ] Export/import capabilities
- [ ] Multi-language support
- [ ] Advanced role-based access control (RBAC)

---

## Dependencies

### Core
- React 18.x
- React Router (integrated in App.jsx)
- Axios - HTTP client
- Bootstrap 5 - UI framework
- React-Leaflet - Map component
- Leaflet - Mapping library
- Leaflet Marker Cluster - Marker clustering

### Development
- Vite - Build tool
- ESLint - Code linting

---

## Browser Compatibility
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile browsers (iOS Safari, Chrome Mobile)

---

## Performance Considerations
- Lazy loading of dashboard components
- Memoized filtering operations in UC01
- Marker clustering to reduce DOM nodes
- Responsive image assets
- API request debouncing for searches
- LocalStorage for session persistence

---

**Document Version**: 1.0
**Last Updated**: May 4, 2026
**Status**: Complete and Ready for Testing
