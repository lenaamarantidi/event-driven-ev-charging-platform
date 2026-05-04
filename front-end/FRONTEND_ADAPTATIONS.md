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

### Expected Endpoints

#### UC01 (EV User Map)
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
