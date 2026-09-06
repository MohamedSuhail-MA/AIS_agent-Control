# Control Plane Documentation

## Purpose
The Control Plane is an Express.js server providing standard MCP JSON-RPC routing, database queuing, and fleet monitoring.

## Concurrency & Queue Engine
Rather than relying on Kafka or external message brokers, this architecture leverages simulated PostgreSQL functionality. 
- **SKIP LOCKED**: When hundreds of agents poll simultaneously, traditional row locks cause massive DB contention. The `dequeueJob()` function safely isolates a single job per polling request.
- **Resilience via Visibility Timeouts**: If a worker node crashes mid-execution, the job is not lost permanently. When a job is locked, `visible_at` is set 60 seconds into the future. 
- **Automated Health Sweeper**: A continuous background routine monitors the fleet. It transitions agents missing their heartbeats to an `offline` status, and aggressively resets stale job locks back to `pending` status so surviving nodes can resume execution without delay.

## AI Guardrails & Prompt Injection Filtering
Before any tool call is enqueued to the edge agent, the orchestrator executes a rigid, intelligence-layer validation check.
- **Lexical Pattern Blocking**: The `AIGuardrails` module scans the `targetHost`, `actionIdentifier`, and `parameters` payload against known prompt injection and system bypass patterns (e.g. "ignore previous instructions", "bypass").
- **Destructive Command Filtering**: Obvious malicious OS or DB commands (e.g., `rm -rf`, `DROP TABLE`, `exec()`, `eval()`) are blocked at the perimeter. This ensures that even if an upstream LLM hallucinated or was tricked into emitting a malicious payload, it never reaches the zero-trust execution boundary.

## Endpoints Deep Dive

### MCP Provider Routes (`/api/mcp/tools/*`)
Acts as the translator between standard LLMs and the internal queuing logic.
1. Schema parsing blocks injection attacks (Zod validation).
2. Traceparent header generated for OpenTelemetry logging.
3. Cryptographically seals payload parameters into an Ed25519 hash.

### Polling API (`/api/agent/*`)
The asynchronous communication boundary. Maintains heartbeat logs to track agent status in the dashboard.

### Operational Dashboard UI
A lightweight React frontend that consumes `/api/ui/dashboard`. Shows human administrators precisely what is running, trace IDs for SOC correlation, and pending agent CSRs.
