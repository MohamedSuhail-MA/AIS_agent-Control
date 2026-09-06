# Zero-Trust LLM Execution Orchestrator

This project is a highly secure, zero-trust execution framework designed to allow LLMs (via the Model Context Protocol) to execute commands on remote, on-premises infrastructure safely.

## Architecture

The system is split into two main components:

1. **Control Plane (Orchestrator)**
   - Exposes an MCP-compliant API for LLMs.
   - Evaluates payloads against **AI Prompt Injection Guardrails** (`AIGuardrails`).
   - Cryptographically signs execution payloads using Ed25519.
   - Maintains an in-memory queue/database with automated health sweepers.
   - Provides a React/Tailwind frontend to visualize fleet status and job queues.

2. **Edge Agent (Remote Execution Node)**
   - A standalone Node CLI bundled via `esbuild`.
   - Polls the Control Plane securely via dynamic mTLS / Certificate Signing Requests (CSRs).
   - Verifies cryptographic signatures before executing any payload.
   - Wraps executions in OS-level guardrails (`JOBOBJECT_BASIC_LIMIT_INFORMATION` and PowerShell Constrained Language Mode).

## Documentation Index

- [Control Plane Architecture](./docs/control-plane/CONTROL_PLANE.md)
- [Edge Agent Details](./docs/agent/AGENT.md)
- [Sandbox & Guardrails](./docs/agent/SANDBOX.md)
- [AI Execution Rules](./AGENTS.md)

## Development

### Prerequisites
- Node.js 22+

### Installation
```bash
npm install
```

### Running Tests
The project features an exhaustive Vitest suite (112+ tests) covering Cryptography, DB Concurrency, AI Guardrails, and End-to-End simulation.
```bash
npm run test
```

### Building for Production
```bash
# Builds the Control Plane (dist/server.cjs) and React SPA
npm run build

# Builds the Standalone Edge Agent CLI (dist/agent.cjs)
npm run build:agent
```

### Docker
A multi-stage `Dockerfile` is included for zero-dependency containerized deployments to Cloud Run or Kubernetes.
```bash
docker build -t zero-trust-orchestrator .
```
