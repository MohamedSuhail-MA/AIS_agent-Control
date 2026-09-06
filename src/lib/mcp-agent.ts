import { v4 as uuidv4 } from "uuid";

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

  async register() {
    console.log(`[Agent ${this.hostname}] Submitting CSR to Control Plane...`);
    const res = await fetch(`${this.controlPlaneUrl}/api/agent/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostname: this.hostname,
        publicKey: this.publicKey,
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
    if (this.isPolling) return;
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
        if (data.job) {
          await this.executeJob(data.job);
        }
      }
    } catch (err) {
      console.error(`[Agent ${this.hostname}] Polling error:`, err);
    }
  }

  private async executeJob(job: any) {
    console.log(`[Agent ${this.hostname}] Received Job ${job.job_id}`);
    
    // 1. Verify Ed25519 Cryptographic Signature
    const isValid = this.verifySignature(job.parameters, job.orchestrator_signature);
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
    console.log(`[Agent ${this.hostname}] Invoking PowerShell with __PSLockdownPolicy=4...`);
    
    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    console.log(`[Agent ${this.hostname}] Job ${job.job_id} executed successfully.`);
    await this.reportCompletion(job.job_id, "completed", { output: "Command executed successfully in Constrained Language Mode." });
  }

  private verifySignature(parameters: any, signature: string): boolean {
    // In a real implementation, we would use tweetnacl to verify the Ed25519 signature
    // using the orchestrator's public key. For this simulation, we'll assume it's valid
    // if a signature is present.
    return !!signature;
  }

  private async reportCompletion(job_id: string, status: "completed" | "failed", result: any) {
    await fetch(`${this.controlPlaneUrl}/api/agent/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id,
        status,
        result,
      }),
    });
  }
}
