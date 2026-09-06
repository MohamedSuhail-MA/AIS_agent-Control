# API Documentation

## MCP Orchestrator Endpoints

### `GET /api/mcp/tools/list`
Exposes the available remote tools to the LLM.
- **Returns**: JSON schema definition of allowed tools.

### `POST /api/mcp/tools/call`
Invoked by the LLM.
- **Body**: `{ "targetHost": "string", "actionIdentifier": "string", "parameters": {} }`
- **Action**: Validates schema via Zod, injects Ed25519 signature, injects OpenTelemetry Traceparent, adds to queue.

## Agent Endpoints

### `POST /api/agent/register`
- **Body**: `{ "hostname": "string", "publicKey": "string" }`
- **Returns**: Agent ID. Agent is placed in `pending_approval` state.

### `POST /api/agent/poll`
- **Body**: `{ "agent_id": "string", "targetHost": "string" }`
- **Action**: Atomically locks and dequeues the oldest eligible job. Returns `null` if empty.

### `POST /api/agent/complete`
- **Body**: `{ "job_id": "string", "status": "completed|failed", "result": {} }`
- **Action**: Marks job as finalized.

## UI Endpoints

### `GET /api/ui/dashboard`
- **Returns**: Real-time dump of `jobs` and `agents`.

### `POST /api/ui/approve-agent`
- **Body**: `{ "agent_id": "string" }`
- **Action**: Approves a pending agent registration.
