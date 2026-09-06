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
