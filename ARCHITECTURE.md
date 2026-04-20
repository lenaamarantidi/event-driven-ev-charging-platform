# SaaS Plug - Advanced Microservices Architecture

## 📋 Αρχιτεκτονική Επισκόπηση

Το SaaSPlug χρησιμοποιεί **event-driven microservices architecture** με RabbitMQ message broker και πολλαπλές βάσεις δεδομένων.

```
┌─────────────────────────────────────────────────────────────────┐
│                       EXTERNAL PROVIDERS                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   RedPlug   │  │  GreenPlug  │  │  BluePlug   │              │
│  │    API      │  │     API     │  │     API     │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
└─────────┼──────────────────┼──────────────────┼──────────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                 │
        ╔════════▼════════╗
        ║  Status Service ║  (3001 HTTP)
        ║  - Fetch status │
        ║  - Log charges  │
        ╚════════╤════════╝
                 │
        ╔════════▼════════════════════════════════╗
        ║        Message Broker (RabbitMQ)        ║
        ║  ┌────────────────────────────────────┐ ║
        ║  │  Topics:                           │ ║
        ║  │  - red.points.updated              │ ║
        ║  │  - green.points.updated            │ ║
        ║  │  - blue.points.updated             │ ║
        ║  │  - billing.charge                  │ ║
        ║  │  - statistics.click                │ ║
        ║  │  - statistics.reservation          │ ║
        ║  └────────────────────────────────────┘ ║
        ╚═════════════╤═════════════════════════╤═╝
                     │                         │
          ┌──────────┴──────────┐     ┌────────┴──────────┐
          │                     │     │                   │
    ╔═════▼═════╗        ╔═════▼═════╗            ╔═════▼═════╗
    │  Central  │        │ Statistics│            │  Billing  │
    │ Service   │        │ Service   │            │  Service  │
    │(3001)     │        │(3004)     │            │(3005)     │
    ╚═════╤═════╝        ╚═════╤═════╝            ╚═════╤═════╝
          │                     │                       │
    ┌─────▼─────┐         ┌─────▼─────┐         ┌─────▼─────┐
    │  Central  │         │Statistics │         │  Billing  │
    │    DB     │         │    DB     │         │    DB     │
    └───────────┘         └───────────┘         └───────────┘
          │
    ╔═════▼═════╗  ╔════════════╗  ╔═════════════╗
    │    Map    │  │Reservation │  │  Sync       │
    │ Service   │  │  Service   │  │  Service    │
    │  (3006)   │  │  (3003)    │  │(Background) │
    ╚═══════════╝  ╚════════════╝  ╚═════════════╝
```

## 🏗️ Microservices

### 1. **Central Service** (Port 3001)
- **Ρόλος**: Κεντρική διαχείριση όλων των σημείων φόρτισης
- **Endpoints**:
  - `GET /api/central/points` - Όλα τα σημεία
  - `GET /api/central/points?status=available` - Φιλτραρισμένα
  - `GET /api/central/points/:id` - Σημείο by ID
  - `POST /api/central/sync` - Sync από παροχό
  - `GET /api/central/providers` - Provider stats
- **Database**: `saas_central`
- **Dependencies**: RabbitMQ, MySQL Central

### 2. **Status Service** (Port 3002)
- **Ρόλος**: Κάνει αιτήσεις σε provider APIs για κατάσταση
- **Endpoints**:
  - `GET /api/status/providers` - Κατάσταση όλων
  - `GET /api/status/:provider` - Κατάσταση παρόχου
  - `POST /api/status/sync-to-central` - Sync προς Central Service
  - `GET /api/status/point/:provider/:id` - Σημείο by ID
- **Database**: MySQL Central (for logging)
- **External APIs**: RedPlug, GreenPlug, BluePlug
- **Message Publishing**: Billing events (API call charges)

### 3. **Reservation Service** (Port 3003)
- **Ρόλος**: Κράτηση σημείων και καταγραφή χρεώσεων
- **Endpoints**:
  - `POST /api/reservations/reserve` - Κράτηση σημείου
  - `GET /api/reservations/list` - Λίστα κρατήσεων
- **Database**: `saas_statistics` (reservations_log)
- **Message Publishing**: Billing events, Statistics events
- **Charges**: 
  - Red: €1.00
  - Green: €0.50
  - Blue: €0.75

### 4. **Statistics Service** (Port 3004)
- **Ρόλος**: Συγχρονισμός στατιστικών και analytics
- **Endpoints**:
  - `GET /api/statistics/daily` - Ημερήσια stats
  - `GET /api/statistics/reservations` - Stats κρατήσεων
  - `GET /api/statistics/summary` - Σύνοψη σήμερα
- **Database**: `saas_statistics`
- **Message Subscriptions**: 
  - `statistics.click` - Click events
  - `statistics.reservation` - Reservation events

### 5. **Billing Service** (Port 3005)
- **Ρόλος**: Χρεώσεις και λογαριασμοί
- **Endpoints**:
  - `GET /api/billing/invoices` - Λίστα λογαριασμών
  - `GET /api/billing/charges` - Χρεώσεις by provider
  - `GET /api/billing/summary` - Σύνοψη χρεώσεων (30 days)
  - `POST /api/billing/generate-invoices` - Δημιουργία λογαριασμών ημέρας
- **Database**: `saas_billing`
- **Message Subscriptions**: `billing.charge` events
- **Charge Types**:
  - API Status Calls: €0.50 per call
  - Reservations: Variable by provider

### 6. **Map Service** (Port 3006)
- **Ρόλος**: Geospatial queries για χάρτη
- **Endpoints**:
  - `GET /api/map/points` - GeoJSON all points
  - `GET /api/map/points/nearby` - Nearby points (Haversine)
  - `GET /api/map/heatmap` - Density heatmap
  - `GET /api/map/clusters` - Clustered points
- **Database**: MySQL Central
- **Output Format**: GeoJSON

### 7. **Sync Service** (Background Worker)
- **Ρόλος**: Ενημέρωση κεντρικής βάσης - 3 κλήσεις/μέρα (02:00, 10:00, 18:00)
- **Flow**:
  1. Fetch status από Status Service για κάθε παροχό
  2. Σύγκριση με αποθηκευμένα δεδομένα
  3. Ενημέρωση Central Service
  4. Καταγραφή αλλαγών στο points_history
  5. Δημοσίευση events για κάθε αλλαγή
- **Database**: MySQL Central
- **Message Publishing**: RabbitMQ events

## 📊 Databases

### Κεντρική Βάση (`saas_central`)
```sql
charging_points         -- Όλα τα σημεία από τους 3 παρόχους
points_history          -- Ιστορικό αλλαγών κατάστασης
provider_points         -- Mapping point_id vs provider
```

### Statistics DB (`saas_statistics`)
```sql
clicks                  -- Κάθε κλικ χρήστη (search, view, filter)
reservations_log        -- Ιστορικό κρατήσεων
daily_statistics        -- Ημερήσια aggregates
```

### Billing DB (`saas_billing`)
```sql
api_calls_log           -- Κάθε κλήση API με κόστος
reservations_charges    -- Χρεώσεις ανά κράτηση
provider_invoices       -- Ημερήσιοι λογαριασμοί παρόχων
```

### Provider DBs (`saas_red`, `saas_green`, `saas_blue`)
```sql
provider_points         -- Σημεία παρόχου (local copy)
provider_point_changes  -- Tracking αλλαγών
```

## 📡 Message Broker Topics (RabbitMQ)

### Points Updates Exchange
- `red.points.updated` - Αλλαγές σημείων Red provider
- `green.points.updated` - Αλλαγές σημείων Green provider
- `blue.points.updated` - Αλλαγές σημείων Blue provider

### Billing Exchange
- `billing.charge` - Γεγονότα χρέωσης (API calls, reservations)

### Statistics Exchange
- `statistics.click` - Click events (searches, views, filters)
- `statistics.reservation` - Reservation events (success/failure)

## 🔄 Request Flows

### Flow 1: Search + Reserve
```
User Frontend 
  → GET /api/central/points?status=available 
  → Central Service (logs click via RabbitMQ)
  → Returns points GeoJSON

User clicks "Reserve" 
  → POST /api/reservations/reserve
  → Reservation Service
    → POST to Provider API (/reserve/:id/:minutes)
    → On success:
      - Logs to statistics DB
      - Publishes to RabbitMQ (billing + statistics)
      - Billing Service charges provider

→ Statistics Service updates clicks counter
→ Billing Service records charge

Daily: Sync Service → 3 calls to Status Service → Update Central DB
```

### Flow 2: Billing Generation
```
Daily (24:00) - Manual trigger: POST /api/billing/generate-invoices

Billing Service queries:
- saas_billing.api_calls_log (group by provider, sum costs)
- saas_billing.reservations_charges (group by provider, sum)

Creates provider_invoices:
red:   100 API calls + 45 reservations = €95.50
green: 150 API calls + 78 reservations = €78.00
blue:  120 API calls + 62 reservations = €69.00
```

### Flow 3: Daily Sync (02:00, 10:00, 18:00)
```
Sync Service 
  → For each provider (red, green, blue):
    → GET /api/status/:provider (via Status Service)
    → POST /api/central/sync (to Central Service)
    → Central Service:
      - Compares with existing points
      - Updates changed statuses
      - Logs to points_history
      - Publishes RabbitMQ events

Changes detected:
- Point 1: available → charging
- Point 5: available → malfunction
- etc...

Events published to RabbitMQ for downstream processing
```

## 🔐 Microservices Communication

| Service | Calls | Via | Frequency |
|---------|-------|-----|-----------|
| Status Service | Provider APIs | HTTP | On demand + Sync Service (3x/day) |
| Central Service | - | REST API | Continuous |
| Reservation Service | Provider APIs | HTTP | On user request |
| Map Service | Central DB | SQL | Continuous |
| Statistics Service | RabbitMQ | Message Queue | Event-driven |
| Billing Service | RabbitMQ | Message Queue | Event-driven |
| Sync Service | Status Service | HTTP | 3x/day (02:00, 10:00, 18:00) |

## 🚀 Deployment

### Docker Compose
```bash
docker-compose up -d
```

**Services & Ports:**
```
RabbitMQ               5672 (AMQP), 15672 (Web UI)
Central Service        3001
Status Service         3002
Reservation Service    3003
Statistics Service     3004
Billing Service        3005
Map Service            3006
Sync Service           (background, no port)

MySQL Databases:
- Central              3306
- Statistics           3307
- Billing              3308
- Red Provider         3309
- Green Provider       3310
- Blue Provider        3311
```

### Environment Variables
```env
NODE_ENV=production
DB_HOST=mysql-central
DB_USER=root
DB_PASSWORD=root
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
REDPLUG_API_URL=https://davinci.softlab.ntua.gr/saas26/redPlug/api
GREENPLUG_API_URL=https://davinci.softlab.ntua.gr/saas26/greenPlug/api
BLUEPLUG_API_URL=https://davinci.softlab.ntua.gr/saas26/bluePlug/api
```

## 📈 Scalability

- **Horizontal Scaling**: Services μπορούν να scale ανεξάρτητα
- **Message Queue**: RabbitMQ handles async processing
- **Database Connection Pools**: Max 10 connections per service
- **Caching**: Potential for Redis integration

## 🔍 Monitoring

### Health Checks
```bash
curl http://localhost:3001/health   # Central Service
curl http://localhost:3002/health   # Status Service
curl http://localhost:3003/health   # Reservation Service
curl http://localhost:3004/health   # Statistics Service
curl http://localhost:3005/health   # Billing Service
curl http://localhost:3006/health   # Map Service

# RabbitMQ Management
http://localhost:15672 (guest:guest)
```

## 🎯 Cost Model

### API Calls to Providers
- Status Check: €0.50 per call
- Total per day: 3 calls × 3 providers × €0.50 = €4.50/day

### Reservations
- Red: €1.00 per reservation
- Green: €0.50 per reservation
- Blue: €0.75 per reservation

### Daily Invoice Example (Day 1)
```
Red:   100 status calls @ €0.50 + 45 reservations @ €1.00 = €95.50
Green: 150 status calls @ €0.50 + 78 reservations @ €0.50 = €114.00
Blue:  120 status calls @ €0.50 + 62 reservations @ €0.75 = €106.50
─────────────────────────────────────────────────────────
Total Daily: €316.00
Monthly (est.): €9,480.00
```

## 📝 Notes

- **Sync Service**: Scheduled at 02:00, 10:00, 18:00 (UTC)
- **Billing**: Generated daily, marks as "pending" until paid
- **Statistics**: Real-time updates via message queue
- **Error Handling**: Failed API calls logged but don't block processing
- **Eventual Consistency**: Stats and billing may lag by few seconds

