# Collector Service v2 - Daily Batch Mode

## Overview

Collector Service v2 implements a **daily batch collection mode** with precise scheduling for each provider:

- **RedPlug**: Syncs at 22:00 (10 PM)
- **GreenPlug**: Syncs at 23:00 (11 PM)  
- **BluePlug**: Syncs at 00:00 (Midnight)

Instead of continuous imports, the service now:
1. Triggers the Points_Service sync endpoint at scheduled times
2. Publishes events to the Message Broker
3. Tracks sync history and errors

## Architecture

```
Collector (Daily Scheduler)
    ├─ RedPlug at 22:00
    ├─ GreenPlug at 23:00
    └─ BluePlug at 00:00
         ↓
    Calls → Points_Service /api/points/sync/:provider
         ↓
    Publishes → Message_Broker /api/events/publish
```

## Daily Sync Schedule

| Provider | Time | Cron Expression | Purpose |
|----------|------|-----------------|---------|
| RedPlug | 22:00 | `0 22 * * *` | End of business day |
| GreenPlug | 23:00 | `0 23 * * *` | Before midnight |
| BluePlug | 00:00 | `0 0 * * *` | Start of next day |

## Endpoints

### Manual Sync

```bash
# Sync specific provider
POST /collector/sync/:provider
# Example: POST /collector/sync/redPlug

# Sync all providers
POST /collector/sync/all
```

### Status & Statistics

```bash
# Get current status of all providers
GET /collector/status

# Get detailed statistics
GET /collector/stats

# Health check
GET /health
```

### Response Example: `/collector/status`

```json
{
  "timestamp": "2026-04-20T19:30:00.000Z",
  "collectors": {
    "redPlug": {
      "schedule": "0 22 * * *",
      "lastSync": "2026-04-20T22:00:15.000Z",
      "syncCount": 5,
      "errorCount": 0,
      "lastError": null
    },
    "greenPlug": {
      "schedule": "0 23 * * *",
      "lastSync": "2026-04-20T23:00:12.000Z",
      "syncCount": 5,
      "errorCount": 0,
      "lastError": null
    },
    "bluePlug": {
      "schedule": "0 0 * * *",
      "lastSync": "2026-04-21T00:00:08.000Z",
      "syncCount": 4,
      "errorCount": 1,
      "lastError": {
        "timestamp": "2026-04-20T00:00:05.000Z",
        "error": "Connection timeout"
      }
    }
  }
}
```

## Events Published

### ProviderSynced
Published when sync completes successfully:
```json
{
  "eventType": "ProviderSynced",
  "data": {
    "provider": "redPlug",
    "syncTime": "2026-04-20T22:00:15.000Z",
    "syncCount": 5,
    "timestamp": "2026-04-20T22:00:15.000Z",
    "source": "collector-service"
  }
}
```

### SyncFailed
Published when sync fails:
```json
{
  "eventType": "SyncFailed",
  "data": {
    "provider": "redPlug",
    "error": "Connection timeout",
    "timestamp": "2026-04-20T22:05:00.000Z",
    "source": "collector-service"
  }
}
```

### AllProvidersSynced
Published when manual `/collector/sync/all` completes:
```json
{
  "eventType": "AllProvidersSynced",
  "data": {
    "results": {
      "redPlug": { "status": "success" },
      "greenPlug": { "status": "success" },
      "bluePlug": { "status": "failed", "error": "..." }
    },
    "duration": 5000,
    "timestamp": "2026-04-20T22:00:15.000Z",
    "source": "collector-service"
  }
}
```

## Configuration

Environment variables:

```bash
PORT=3104                                          # Service port
POINTS_SERVICE_URL=http://localhost:3001          # Points Service URL
MESSAGE_BROKER_URL=http://localhost:3003          # Message Broker URL
```

## Migration from v1

**v1 Features removed:**
- ❌ Continuous polling with `IMPORT_INTERVAL`
- ❌ In-memory import logs and statistics
- ❌ Direct adapter imports (`/collector/import`)
- ❌ Streaming endpoints

**v2 Features added:**
- ✅ Daily batch scheduling (3 times per day)
- ✅ Message Broker integration
- ✅ Points Service coordination
- ✅ Event publishing
- ✅ Sync history tracking (per-provider)
- ✅ Manual sync capabilities

## Dependencies

```json
{
  "express": "^4.18.2",
  "axios": "^1.4.0",
  "uuid": "^9.0.0",
  "node-schedule": "^2.1.1"
}
```

**Key package**: `node-schedule` - enables cron-based job scheduling

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
```

## Testing

Manual sync test:
```bash
# Trigger immediate sync (useful for testing)
curl -X POST http://localhost:3104/collector/sync/redPlug

# Check status
curl http://localhost:3104/collector/status

# Get stats
curl http://localhost:3104/collector/stats
```

## Integration with System

The Collector Service is part of the daily data pipeline:

```
End of Day (22:00-00:00)
    ↓
Collector triggers 3 provider syncs
    ↓
Points_Service receives sync requests
    ↓
Points_Service updates central repository
    ↓
Events published to Message Broker
    ↓
Analytics + Billing consume events
    ↓
Next morning: Aggregated data ready
```

## Error Handling

- Sync failures per provider are logged and don't block other providers
- Last 10 errors per provider are stored in-memory
- Failed syncs trigger `SyncFailed` event for monitoring
- Graceful shutdown cancels all scheduled jobs

## Future Enhancements

- [ ] Persist sync history to PostgreSQL
- [ ] Webhook notifications on sync failures
- [ ] Configurable retry logic with exponential backoff
- [ ] Sync duration metrics
- [ ] Per-provider sync success rates
