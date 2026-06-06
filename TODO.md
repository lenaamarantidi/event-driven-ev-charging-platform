# TODO - Reservation analytics/billing behavior change

## Plan implementation checklist
- [x] Step A: Update `Reservation_Service/src/rabbitmq.js` to remove publishing to `billing_exchange` and stop publishing to `analytics_exchange` per reservation.

- [x] Step B: Add daily analytics batch publisher job to `Reservation_Service/src/index.js` (query `reservation_logs` for today + status='reserved', build per-provider aggregates, publish to analytics exchange with routing key `analytics.reservations.daily`).

- [x] Step C: Update `Analytics_Service/src/rabbitmq.js` to stop consuming `reservation_successful` and consume/bind `analytics.reservations.daily`.




- [x] Step D: Update `handleAnalyticsEvent` in `Analytics_Service/src/rabbitmq.js` to store daily aggregates into `analytics_daily` without per-reservation inserts.

- [ ] Step E: Run quick smoke test: reserve once; verify analytics_daily increments only after daily batch; verify billing no longer receives per-reservation events; verify Points still updates.

