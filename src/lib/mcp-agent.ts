import { v4 as uuidv4 } from "uuid";
import nacl from "tweetnacl";
import { WindowsSandbox } from "./agent/sandbox";

/**
 * Simulated Rust Polling Agent.
 * In a real environment, this would be a Rust binary running on a Windows server,
 * utilizing Windows Job Objects, WDAC, and mTLS.
 */
export class RemoteExecutionAgent {
  private agentId: string | null = null;
  private isPolling = false;
  private intervalId: any = null;

  constructor(
    private controlPlaneUrl: string,
    private hostname: string,
    private publicKey: string,
    private privateKey: string
  ) {}

  async register(dynamicPublicKey?: string) {
    console.log(`[Agent ${this.hostname}] Submitting CSR to Control Plane...`);
    const keyToRegister = dynamicPublicKey || this.publicKey;
    
    const res = await fetch(`${this.controlPlaneUrl}/api/agent/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostname: this.hostname,
        publicKey: keyToRegister,
      }),
    });

    
    if (res.ok) {
      const data = await res.json();
      this.agentId = data.agent_id;
      console.log(`[Agent ${this.hostname}] Registered with ID ${this.agentId}. Pending manual approval.`);
    } else {
      console.error(`[Agent ${this.hostname}] Registration failed.`);
    }
  }

  startPolling(intervalMs = 5000) {
    if (this.isPolling) {
      this.stopPolling();
    }
    if (!this.agentId) {
      console.error(`[Agent ${this.hostname}] Cannot poll without agent ID. Call register() first.`);
      return;
    }
    
    this.isPolling = true;
    console.log(`[Agent ${this.hostname}] Starting mTLS polling...`);
    this.intervalId = setInterval(() => this.poll(), intervalMs);
  }

  stopPolling() {
    this.isPolling = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll() {
    try {
      const res = await fetch(`${this.controlPlaneUrl}/api/agent/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: this.agentId,
          targetHost: this.hostname,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.job && data.job.job_id) {
          await this.executeJob(data.job);
        }
      } else {
         console.error(`[Agent ${this.hostname}] Polling failed with status: ${res.status}`);
      }
    } catch (err) {
      console.error(`[Agent ${this.hostname}] Polling error:`, err);
    }
  }

  private async executeJob(job: any) {
    console.log(`[Agent ${this.hostname}] Received Job ${job.job_id}`);
    
    // 1. Verify Ed25519 Cryptographic Signature
    const isValid = this.verifySignature(job);
    if (!isValid) {
      console.error(`[Agent ${this.hostname}] CRITICAL: Invalid Ed25519 signature. Dropping job.`);
      await this.reportCompletion(job.job_id, "failed", "Invalid Signature");
      return;
    }

    // 2. Extract OpenTelemetry Traceparent
    console.log(`[Agent ${this.hostname}] Distributed Trace ID: ${job.mcp_traceparent}`);

    // 3. Setup Windows Job Object (Simulated)
    console.log(`[Agent ${this.hostname}] Configuring JOBOBJECT_BASIC_LIMIT_INFORMATION (KILL_ON_JOB_CLOSE)...`);
    
    // 4. Execute in PowerShell Constrained Language Mode (Simulated)
    try {
      const executionResult = WindowsSandbox.wrapInJobObject(() => {
        console.log(`[Agent ${this.hostname}] Invoking PowerShell with __PSLockdownPolicy=4...`);
        // We pass tool_name for simplicity in testing as the command string
        return WindowsSandbox.executeInConstrainedLanguageMode(job.tool_name);
      });

      console.log(`[Agent ${this.hostname}] Job ${job.job_id} executed successfully.`);
      await this.reportCompletion(job.job_id, "completed", { output: executionResult });
    } catch (sandboxErr: any) {
      console.error(`[Agent ${this.hostname}] Execution Guardrail Blocked Job:`, sandboxErr.message);
      await this.reportCompletion(job.job_id, "failed", { error: sandboxErr.message });
    }
  }

  private verifySignature(job: any): boolean {
    try {
      // Prevent replay attacks (5 minute window)
      const now = Date.now();
      if (Math.abs(now - job.timestamp) > 300000) {
        console.error(`[Agent ${this.hostname}] Replay Attack Mitigated: Job timestamp is stale or from the future.`);
        return false;
      }

      const publicKeyBytes = Buffer.from(this.publicKey, "base64");
      const signatureBytes = Buffer.from(job.orchestrator_signature, "base64");
      
      const messageString = JSON.stringify({
        targetHost: this.hostname,
        actionIdentifier: job.tool_name,
        parameters: job.parameters,
        timestamp: job.timestamp
      });
      const messageBytes = Buffer.from(messageString, "utf-8");
      
      const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
      return isValid;
    } catch (err) {
      console.error(`[Agent ${this.hostname}] Signature verification failed:`, err);
      return false;
    }
  }

  private async reportCompletion(job_id: string, status: "completed" | "failed", result: any) {
    try {
      await fetch(`${this.controlPlaneUrl}/api/agent/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id,
          status,
          result,
        }),
      });
    } catch (err) {
      console.error(`[Agent ${this.hostname}] Failed to report completion for job ${job_id}:`, err);
    }
  }
}
