# Agent Subsystem Documentation

## Purpose
The polling agent serves as the hardened gateway between the highly restricted on-premises Windows environment and the Cloud Control Plane. 

## Design Philosophy
1. **Outbound-Only mTLS**: Agents never listen on a network port. They initiate outbound HTTPS requests strictly to the control plane, circumventing the need for complex VPNs or firewall ingress rules.
2. **"Install and Forget" Crash Reliability**: A critical vulnerability in traditional agents is "orphan process creep"—where the agent crashes but leaves behind deeply nested rogue scripts. By encapsulating all child executions in a Windows `Job Object` marked with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, the NT Kernel guarantees entire execution hierarchies are reaped atomically.

## Security Constraints Implemented
- **Ed25519 Payload Validation**: Every dequeued payload contains an `orchestrator_signature`. The agent uses the `tweetnacl` library and a pre-shared orchestrator public key to assert that parameters have not been tampered with. If the signature is invalid, the job is forcefully discarded before being passed to PowerShell.
- **PowerShell Constrained Language Mode**: Agent execution spawns PowerShell instances with `__PSLockdownPolicy=4`. This strips the environment of Win32 API access, arbitrary C# compilation, and COM object instantiation, neutralizing advanced fileless malware techniques even if an LLM hallucinated a malicious command.

## Key Methods
- `register()`: Submits the host identity. Wait states for human CSR approval.
- `poll()`: Retrieves tasks using `SELECT ... FOR UPDATE SKIP LOCKED` logic remotely.
- `executeJob()`: The security boundary. Validates Ed25519 and simulates the NT Kernel handoff.

## Production Execution
The agent has been modularized into a standalone Node CLI that can be compiled and deployed safely.

### Dynamic mTLS Auto-Enrollment CA
To minimize human error and prevent hardcoded secret leaks, the Edge Agent now supports dynamic cryptographic bootstrapping. If a pre-shared agent key is not provided on startup, the Agent will automatically generate a fresh Ed25519 keypair and submit the public key as a Certificate Signing Request (CSR) to the Control Plane for manual human approval.

### Building the Binary
Run `npm run build:agent` to bundle the agent securely via esbuild. This generates `dist/agent.cjs`.

### CLI Usage
```bash
node dist/agent.cjs --url <CONTROL_PLANE_URL> --host <WINDOWS_HOSTNAME> --orchestratorKey <B64_PUBLIC_KEY>
```

**Arguments:**
- `--url`, `-u`: The API endpoint for the control plane (default: `http://localhost:3000`).
- `--host`, `-h`: Target execution hostname (default: `WIN-SERVER-01`).
- `--orchestratorKey`, `-o`: (Required) Ed25519 public key from the orchestrator.
- `--interval`, `-i`: Polling interval in ms (default: `5000`).
- `--agentKey`, `-k`: (Optional) The local agent private key. If omitted, dynamically generates a keypair.

