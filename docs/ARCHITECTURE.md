# Architecture Reference

## Overview
The Zero-Trust Remote Execution Platform relies on a decoupled, asynchronous polling architecture designed to safely bridge cloud-hosted AI orchestration engines with sensitive on-premises enterprise environments.

## Component C4 Architecture

### 1. Control Plane (Orchestrator API)
Located in `src/lib/orchestrator/`.
- **Purpose**: Exposes the Model Context Protocol (MCP) to the LLM. Queues jobs securely.
- **Data Tier**: Uses a simulated PostgreSQL database (in `db.ts`). It implements the `SELECT ... FOR UPDATE SKIP LOCKED` pattern using a `visible_at` timeout integer to ensure lock-free parallel polling.
- **Cryptography**: Uses `tweetnacl` to sign every payload using an Ed25519 private key.

### 2. Edge Agent (Windows Poll Worker)
Located in `src/lib/mcp-agent.ts`.
- **Purpose**: Runs inside the target enterprise network. Establishes outbound-only HTTPS polling.
- **Sandboxing**: 
  - Validates the Ed25519 signature before deserialization.
  - Wraps execution in a Windows Job Object (`KILL_ON_JOB_CLOSE`).
  - Enforces PowerShell Constrained Language Mode (`__PSLockdownPolicy=4`).

### 3. Monitoring Dashboard
Located in `src/App.tsx`.
- **Purpose**: Real-time view of agent registration, fleet health, and queue depth. Extracts OpenTelemetry `traceparent` headers for SOC auditing.

## Threat Model Mitigations
- **Spoofing**: Out-of-band manual CSR approval process (simulated via `/api/ui/approve-agent`).
- **Tampering**: Ed25519 signatures mathematically guarantee the payload is identical to what the LLM orchestrated.
- **Denial of Service**: `visible_at` timeout ensures crashed agents release their queued tasks back to the pool.
