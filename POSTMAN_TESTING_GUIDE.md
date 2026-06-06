# Postman Testing Guide - Full Reservation Flow

## System Status ✅
Both services are running and ready for testing:
- **Reservation_Service**: http://localhost:3106 (default from Reservation_Service/.env.template)
- **Points_Service**: http://localhost:3001 (Docker container)
- **RabbitMQ**: amqp://localhost:5672 (Docker container)
- **MariaDB**: localhost:3320 (reservations) and Docker:3306 (central)

> If your Reservation_Service is using a different port, adjust the URLs accordingly.

## Postman Setup
1. Import the collection file:
   - `Reservation_Service/reservation-service-postman-collection.json`
2. In Postman, open the collection variables and replace `apiKey` with your team key:
   - `sk_saas_5dec282b47047b6eced41e64`
3. If you want to test the provider API directly, leave `redPlugBaseUrl` as the default or change it to your local provider URL.
4. For local service tests, use the `Reservation Service Health Check`, `Create Reservation - redPlug`, `List Reservations`, and `Get Reservation by ID` requests.

## Test 1: Health Check Both Services

### Request 1a: Reservation_Service Health
```
GET http://localhost:3009/health
```
Expected Response (200 OK):
```json
{
  "status": "ok",
  "service": "Reservation_Service",
  "port": 3009,
  "timestamp": "2026-06-01T16:00:00.000Z"
}
```

### Request 1b: Points_Service Health
```
GET http://localhost:3001/health
```
Expected Response (200 OK):
```json
{
  "status": "ok",
  "service": "Points_Service",
  "port": 3001,
  "timestamp": "2026-06-01T16:00:00.000Z"
}
```

---

## Test 2: Create Reservation

### Request: POST /api/reserve
```
POST http://localhost:3009/api/reserve
Content-Type: application/json

{
  "providerName": "redPlug",
  "pointId": "RED-001",
  "duration": 30,
  "userId": "test-user-123"
}
```

### Expected Response (on successful provider API call):
```json
{
  "success": true,
  "reservationId": "uuid-string",
  "providerId": 1,
  "providerName": "redPlug",
  "pointId": "RED-001",
  "duration": 30,
  "reservationDetails": {
    "reservationendtime": "2026-06-01T16:30:00Z",
    "status": "reserved",
    "latitude": 38.12345,
    "longitude": 23.67890,
    ...other provider-specific fields
  }
}
```

### What happens behind the scenes:
1. Reservation_Service validates the request
2. Calls redPlug provider API at: `https://davinci.softlab.ntua.gr/saas26/redPlug/api/reserve/RED-001/30`
3. Normalizes the response fields
4. Publishes `reservation_successful` event to RabbitMQ `billing_exchange` and `analytics_exchange`
5. Returns normalized response to Postman

---

## Test 3: Verify RabbitMQ Event

### Access RabbitMQ Management UI
```
http://localhost:15672
Username: guest
Password: guest
```

### What to check:
1. Go to **Queues** tab
2. Look for queue: `points_reservation_queue`
3. Check message count (should increase after successful reservation)
4. Click queue to see message details

---

## Test 4: Verify Points_Service Event Consumption

### Request: Points_Service Health (again)
```
GET http://localhost:3001/health
```

### Check Points_Service Logs
```
docker compose logs central-service --follow
```
You should see logs like:
```
✓ Points Service connected to RabbitMQ
✓ Listening on queue: points_reservation_queue for reservation_successful events
[RabbitMQ] Consuming reservation_successful event
[DB] Updating point RED-001 status to reserved
```

---

## Test 5: Verify Database Updates

### Check Reservation Logged in MariaDB
```sql
-- Connect to: localhost:3320
-- Database: reservation_db
-- User: reservation_user / reservation_pass

SELECT * FROM reservation_logs WHERE point_id = 'RED-001';
```

Expected columns:
- `reservation_id`: UUID from POST response
- `provider_name`: redPlug
- `provider_id`: 1
- `point_id`: RED-001
- `duration`: 30
- `status`: pending
- `reservation_details`: JSON containing normalized response

### Check Central Points Database (optional)
```sql
-- Connect to: localhost:3306 (via Docker)
-- Database: central
-- User: root / root

SELECT * FROM points WHERE point_id = 'RED-001';
```

Expected fields:
- `status`: reserved (or matching current state)
- `reservation_end_time`: Timestamp from reservation

---

## Troubleshooting

### Test returns 403 Forbidden
- This is likely from the provider API (redPlug/greenPlug/bluePlug)
- Check if the API credentials are configured in the provider services
- Try with a different provider or point ID that's known to exist

### Points_Service not consuming events
- Check RabbitMQ logs: `docker compose logs rabbitmq`
- Verify exchange exists: Check RabbitMQ Management UI → Exchanges
- Verify queue exists: Check RabbitMQ Management UI → Queues
- Check Points_Service logs: `docker compose logs central-service`

### Database connection errors
- Verify MariaDB is running: `docker compose ps`
- Check MariaDB logs: `docker compose logs mysql-central`
- Verify credentials in Reservation_Service environment variables
- For local testing, ensure port 3320 is exposed and accessible

### Reservation_Service not running
- Check if npm start is still executing in the terminal
- Try restarting: Kill the terminal window and re-run the startup command
- Check environment variables are still set (DB_HOST, DB_PORT, etc.)

---

## Complete Test Sequence

1. ✅ Start services (already running)
2. Run health checks (Test 1)
3. Create a reservation (Test 2)
4. Check RabbitMQ events (Test 3)
5. Verify Points_Service consumed event (Test 4)
6. Query database to confirm update (Test 5)
7. Wait 30 minutes to see reservation expiry handling (or modify duration for faster testing)

---

## Notes

- **Field Name Mapping**: The API uses `duration` (minutes), `pointId`, and `providerName` instead of the old `minutes`, `pointid`, and `provider`
- **Normalized Response**: All provider responses are normalized to the same format before being returned
- **Async Event Publishing**: The RabbitMQ event is published asynchronously (non-blocking), so the HTTP response is returned before the event is fully consumed by Points_Service
- **Test Data**: Point IDs like "RED-001" may not exist in test providers; consult provider API documentation for valid test points
