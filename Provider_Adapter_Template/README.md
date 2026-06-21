# Provider Adapter Template

This folder is a template for creating a new provider adapter without modifying the existing redPlug, greenPlug, or bluePlug adapters.

## Purpose

Use this template when a provider is registered with `integration_pending` and you want to build a dedicated adapter service for that provider.

## What it provides

- `GET /health`
- `GET /api/points`
- `GET /api/points/:pointId`
- `POST /api/reserve`
- generic proxy/auth handling
- placeholder normalization helpers for provider-specific response mapping

## How to use it

1. Copy this folder and rename it, for example to `Provider_Adapter_orangePlug`.
2. Update `package.json` name.
3. Set provider-specific values in `.env` based on `.env.template`.
4. Adjust `normalizeListItem`, `normalizePointDetails`, and `buildReserveRequest` in `src/index.js`.
5. Add a Docker Compose service for the new adapter when you are ready to run it.
6. Update Provider Management assignment logic if this provider should move from `integration_pending` to `integrated`.

## Expected adapter contract

The rest of the system expects the adapter to expose:

- `GET /api/points` -> `{ "points": [...] }`
- `GET /api/points/:pointId` -> `{ "point": { ... } }`
- `POST /api/reserve` with body `{ "pointId": "...", "duration": 60 }` -> `{ "reservation": { ... } }`

## Notes

- This template is intentionally generic. It does not try to auto-detect provider schemas.
- It is meant for the simple model: one provider, one adapter service.