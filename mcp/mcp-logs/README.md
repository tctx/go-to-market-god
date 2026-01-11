# MCP Project Log Router

*Real-time browser log integration for AI-powered development*

---

## Overview

This component acts as your project's log router in the MCP (Model-Context Protocol) system. It receives real-time browser logs from a central MCP server and saves them locally for your AI assistant to analyze.

---

## How the Complete System Works

### The Full Log Flow

```
Chrome Browser 
    ↓ (console.log, errors, network failures)
Chrome Extension (mcp-log-interceptor)
    ↓ (POST with auth_token)
Central MCP Server (port 4000)
    ↓ (validates token, routes to project)
Your Project's Log Router (port 4001) ← YOU ARE HERE
    ↓ (saves to local files)
Local Log Files
    ↓ (AI assistant reads)
Enhanced Development Experience
```

### System Components

#### 1. **Chrome Extension** (installed once, works everywhere)
- **Location**: Separate repository, loaded as unpacked extension in Chrome
- **Function**: Injects logging scripts into all web pages
- **Captures**: 
  - `console.log()`, `console.error()`, `console.warn()`, `console.info()`
  - Network failures (fetch errors, XHR failures)
  - Page load/reload events
- **Authentication**: Uses your project's auth token stored in Chrome's extension storage

#### 2. **Central MCP Server** (hosted separately)
- **Location**: Separate repository, typically runs in Docker
- **Port**: 4000 (web interface + API)
- **Database**: PostgreSQL for app registrations
- **Functions**:
  - Generates secure auth tokens via web interface
  - Registers projects with their log router locations
  - Routes incoming logs to the correct project's local router
  - Validates authentication for all requests

#### 3. **Your Project's Log Router** (this component)
- **Port**: 4001 (local API endpoint)
- **Function**: Receives logs from central server and saves locally
- **Files Created**:
  - `logs/mcp-logs.txt` - Full history of all logs
  - `logs/mcp-temp-logs.txt` - Current session (resets on page reload)

---

## Configuration

### `config.json`

```json
{
  "auth_token": "your-64-character-token-here",
  "log_router_location": "/logs",
  "dev_urls": ["http://localhost:8000"],
  "log_limit_mb": 1
}
```

**Fields:**
- `auth_token`: Secure token from central MCP server (get from `http://localhost:4000`)
- `log_router_location`: Relative path to logs directory (usually "/logs")
- `dev_urls`: URLs where your app will run (for validation)
- `log_limit_mb`: Max size before log rotation (in MB)

### Key Files

- **`register-mcp.js`**: Registers your project with the central server
- **`log-router.js`**: Local server that receives and saves logs
- **`package.json`**: Dependencies and npm scripts
- **`logs/`**: Directory where log files are saved

---

## Setup Instructions

### Prerequisites

1. **Central MCP Server** must be running (separate repository called mcp-logs)
2. **Chrome Extension** must be installed with your auth token (separate repository called mcp-log-interceptor)
3. **PostgreSQL** database accessible to central server (handled by mcp-logs)

### Quick Setup

```bash
# Install dependencies and configure everything
npm run setup-project
```

This single command:
1. Picks an available dev port for your app
2. Installs MCP log router dependencies
3. Registers your project with the central MCP server
4. Starts your local log router on port 4001

### Manual Setup

If you need to set up components individually:

```bash
# 1. Install dependencies
npm --prefix mcp/mcp-logs install

# 2. Register with central server
npm --prefix mcp/mcp-logs run mcp:register

# 3. Start log router
npm --prefix mcp/mcp-logs run mcp:router
```

---

## Log File Format

### Example Log Entries

```
[2024-01-15T10:30:45.123Z] [LOG] Testing MCP logging system {"url":"https://example.com","timestamp":"2024-01-15T10:30:45.123Z"}
[2024-01-15T10:30:46.456Z] [ERROR] This is a test error {"url":"https://example.com","timestamp":"2024-01-15T10:30:46.456Z"}
[2024-01-15T10:30:47.789Z] [WARN] This is a warning {"url":"https://example.com","timestamp":"2024-01-15T10:30:47.789Z"}
[2024-01-15T10:30:48.012Z] [ERROR] Fetch error: 404 Not Found on https://api.example.com/data {"url":"https://example.com","timestamp":"2024-01-15T10:30:48.012Z"}
```

### Log Types Captured

- **LOG**: Regular console.log() output
- **ERROR**: console.error() + JavaScript errors + network failures
- **WARN**: console.warn() output  
- **INFO**: console.info() output
- **reset_logs**: Special marker when page reloads (resets temp log)

---

## API Endpoints

### Local Log Router (port 4001)

#### `POST /route-log`
Receives logs from the central MCP server.

**Request:**
```json
{
  "type": "log",
  "message": "Hello world",
  "context": {
    "url": "https://example.com",
    "timestamp": "2024-01-15T10:30:45.123Z"
  }
}
```

**Response:**
```json
{
  "status": "log routed"
}
```

---

## Troubleshooting

### Common Issues

#### "Port 4001 already in use"
```bash
# Kill existing processes on port 4001
lsof -ti:4001 | xargs kill -9

# Then restart the log router
npm --prefix mcp/mcp-logs run mcp:router
```

#### "Registration failed"
1. Verify central MCP server is running (`http://localhost:4000`)
2. Check that `auth_token` in `config.json` matches server
3. Ensure `log_router_location` path is correct

#### "No logs appearing"
1. **Check Chrome extension**: Verify it's loaded and has auth token
2. **Check central server**: Ensure it's running and receiving requests
3. **Check local router**: Verify it's running on port 4001
4. **Check file permissions**: Ensure log router can write to `logs/` directory

#### "Log router not starting"
1. **Install dependencies**: `npm --prefix mcp/mcp-logs install`
2. **Check port availability**: `lsof -i :4001`
3. **Check Node.js version**: Requires Node.js 14+

### Debug Steps

1. **Test central server**: Visit `http://localhost:4000` (should show token generator)
2. **Test registration**: Run `npm --prefix mcp/mcp-logs run mcp:register` (should show success)
3. **Test log router**: Check if `http://localhost:4001` responds
4. **Test extension**: Open DevTools, look for "MCP interceptor fully operational"
5. **Test end-to-end**: Run console commands and check `logs/mcp-temp-logs.txt`

### Log Monitoring

```bash
# Watch logs in real-time
tail -f mcp/mcp-logs/logs/mcp-temp-logs.txt

# Check log router status
curl http://localhost:4001/route-log -X POST -H "Content-Type: application/json" -d '{"type":"test","message":"test","context":{}}'
```

---

## Development Workflow

### For AI Assistants

Your AI assistant can now access real-time browser logs by reading:
- `mcp/mcp-logs/logs/mcp-logs.txt` (complete history)
- `mcp/mcp-logs/logs/mcp-temp-logs.txt` (current session)

This enables powerful debugging capabilities:
- See exactly what errors users encounter
- Monitor network request failures
- Track console output from your applications
- Understand user behavior through log patterns

### For Developers

1. **Start development**: `npm run setup-project` (once per project)
2. **Build your app**: Normal development workflow
3. **Test in browser**: Extension automatically captures logs
4. **Debug with AI**: AI assistant can see all browser activity
5. **Fix issues**: Real-time feedback loop with comprehensive logging

---

## Security Notes

- **Auth tokens**: Keep your auth token secure; it provides access to your logs
- **Local only**: Log router only accepts connections from localhost
- **File permissions**: Ensure log files have appropriate read/write permissions
- **Token rotation**: Regenerate tokens periodically for security

---

## Performance

- **Log size limits**: Configured via `log_limit_mb` in `config.json`
- **Auto-rotation**: Logs rotate when size limit exceeded
- **Session management**: Temp logs reset on page reload to prevent bloat
- **Network efficient**: Only sends logs when console activity occurs

---

Happy debugging with real-time log access! 🚀 