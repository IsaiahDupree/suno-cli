# Suno CLI API Documentation

## Overview

The Suno CLI can run in server mode, exposing a REST API for health checks, metrics, and status monitoring.

## Running the Server

### Local Server

```bash
# Run server on default port 3000
node suno-cli.js server

# Run on custom port
node suno-cli.js server --port 8080

# Run on custom host
node suno-cli.js server --host 0.0.0.0 --port 3000
```

### Environment Variables

```bash
SUNO_PORT=3000          # Server port (default: 3000)
SUNO_HOST=localhost     # Server host (default: localhost)
SUNO_API_KEY=...        # API key for authentication (optional)
```

### Vercel Deployment

The service can be deployed to Vercel as a serverless function:

```bash
# Deploy to Vercel
npx vercel --prod

# With environment variables
npx vercel --prod --env SUNO_API_KEY=your-key
```

## API Endpoints

### Health Check

**GET** `/api/health`

Returns the health status of the service and all components.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-04-17T12:00:00.000Z",
  "uptime": 3600,
  "memory": {
    "rss": 45678000,
    "heapTotal": 34567000,
    "heapUsed": 12345000,
    "external": 500000
  },
  "services": {
    "browser": "ready",
    "api": "ready",
    "auth": "configured"
  }
}
```

**Example:**
```bash
curl http://localhost:3000/api/health
```

---

### Metrics Summary

**GET** `/api/metrics`

Returns usage metrics for the specified period.

**Query Parameters:**
- `days` (integer, default: 7) - Number of days to include in summary

**Response:**
```json
{
  "period": "7 days",
  "summary": {
    "generationCount": 45,
    "downloadCount": 38,
    "apiCallCount": 200,
    "errorCount": 2,
    "byType": {
      "generation": 45,
      "download": 38,
      "api_call": 200,
      "error": 2
    }
  }
}
```

**Examples:**
```bash
# Last 7 days
curl http://localhost:3000/api/metrics

# Last 30 days
curl http://localhost:3000/api/metrics?days=30

# Last 1 day
curl http://localhost:3000/api/metrics?days=1
```

---

### Error Statistics

**GET** `/api/errors`

Returns error statistics for the specified period.

**Query Parameters:**
- `days` (integer, default: 7) - Number of days to include in summary

**Response:**
```json
{
  "period": "7 days",
  "totalErrors": 2,
  "byType": {
    "APIError": 1,
    "NetworkError": 1
  },
  "byStatus": {
    "500": 1,
    "503": 1
  }
}
```

**Examples:**
```bash
# Last 7 days
curl http://localhost:3000/api/errors

# Last 30 days
curl http://localhost:3000/api/errors?days=30
```

---

### Server Status

**GET** `/api/status`

Returns current server status and uptime information.

**Response:**
```json
{
  "running": true,
  "uptime": 3600,
  "timestamp": "2026-04-17T12:00:00.000Z",
  "port": 3000,
  "host": "localhost"
}
```

**Example:**
```bash
curl http://localhost:3000/api/status
```

---

## Authentication

The API supports optional API key authentication via environment variables or stored keys.

### Configuration

```bash
# Set API key via environment variable
export SUNO_API_KEY=your-api-key

# Or store in ~/.suno/auth/api-key
echo "your-api-key" > ~/.suno/auth/api-key
```

### Validation

API keys are validated with:
- Minimum length: 10 characters
- Allowed characters: alphanumeric, underscores, hyphens

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200 OK` - Request successful
- `400 Bad Request` - Invalid parameters
- `404 Not Found` - Endpoint not found
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Service temporarily unavailable

**Error Response Format:**
```json
{
  "error": "Internal server error",
  "message": "Detailed error message"
}
```

---

## Rate Limiting

The API implements rate limiting to prevent abuse:

- Default: 10 requests per 60 seconds
- Configurable via environment variables or API client options

When rate limited, the server returns `429 Too Many Requests`.

---

## Monitoring & Metrics

The API automatically tracks:

1. **Generations** - Music generation events
2. **Downloads** - File download events
3. **API Calls** - All HTTP requests
4. **Errors** - Exceptions and failures

Metrics are stored locally in `~/.suno/metrics/` and can be queried via the `/api/metrics` endpoint.

---

## Local Development

### Run Server with Debug Logging

```bash
SUNO_LOG_LEVEL=debug node suno-cli.js server
```

### Test All Endpoints

```bash
# In another terminal
chmod +x test-api.sh
./test-api.sh
```

### View Logs

```bash
# Real-time logs
tail -f ~/.suno/errors/errors-$(date +%Y-%m-%d).jsonl

# Metrics
tail -f ~/.suno/metrics/metrics-$(date +%Y-%m-%d).jsonl
```

---

## Deployment Checklist

Before deploying to production:

- [ ] Set `SUNO_API_KEY` environment variable
- [ ] Configure `SUNO_PORT` if needed (default: 3000)
- [ ] Test `/api/health` endpoint
- [ ] Verify metrics collection works
- [ ] Check error logging
- [ ] Set up monitoring/alerting on error rates

---

## Vercel Deployment Example

```bash
# Login to Vercel
npx vercel login

# Set environment variables
npx vercel env add SUNO_API_KEY

# Deploy
npx vercel --prod

# View logs
npx vercel logs

# Access API
curl https://suno-cli.vercel.app/api/health
```

---

## Support

For issues or questions:

1. Check server logs: `tail -f ~/.suno/errors/errors-$(date +%Y-%m-%d).jsonl`
2. View metrics: `curl http://localhost:3000/api/metrics`
3. Check health: `curl http://localhost:3000/api/health`
