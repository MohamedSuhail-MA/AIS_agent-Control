import { v4 as uuidv4 } from "uuid";
import nacl from "tweetnacl";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { WindowsSandbox } from "./agent/sandbox";

/**
 * Simulated Rust Polling Agent.
 * In a real environment, this would be a Rust binary running on a Windows server,
 * utilizing Windows Job Objects, WDAC, and mTLS.
 */
export class RemoteExecutionAgent {
  private agentId: string | null = null;
  private isPolling = false;
  private isPollRequestActive = false;
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
    if (this.isPollRequestActive) return;
    this.isPollRequestActive = true;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s fetch timeout

      const res = await fetch(`${this.controlPlaneUrl}/api/agent/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: this.agentId,
          targetHost: this.hostname,
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        if (data && data.job && data.job.job_id) {
          await this.executeJob(data.job);
        }
      } else {
         console.error(`[Agent ${this.hostname}] Polling failed with status: ${res.status}`);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.error(`[Agent ${this.hostname}] Polling timeout.`);
      } else {
        console.error(`[Agent ${this.hostname}] Polling error:`, err);
      }
    } finally {
      this.isPollRequestActive = false;
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

    // Artifact Exfiltration Intercept
    if (job.tool_name === "__system_upload_artifact") {
      console.log(`[Agent ${this.hostname}] ARTIFACT UPLOAD INITIATED: Streaming file to Control Plane...`);
      try {
        const filePath = job.parameters?.filePath;
        if (!filePath) throw new Error("Missing filePath parameter");
        const downloadUrl = await this.uploadArtifact(job.job_id, filePath);
        await this.reportCompletion(job.job_id, "completed", { output: `File securely uploaded. Download URL: ${downloadUrl}` });
      } catch (err: any) {
        console.error(`[Agent ${this.hostname}] Artifact upload failed:`, err.message);
        await this.reportCompletion(job.job_id, "failed", { error: err.message });
      }
      return;
    }

    // System Update Intercept
    if (job.tool_name === "__system_update_agent") {
      console.log(`[Agent ${this.hostname}] SYSTEM UPDATE INITIATED: Downloading new binary...`);
      try {
        await this.performSelfUpdate(job);
      } catch (err: any) {
        console.error(`[Agent ${this.hostname}] Self-update failed:`, err.message);
        await this.reportCompletion(job.job_id, "failed", { error: err.message });
        return; // Halt update, agent remains alive
      }
      
      try {
        await this.reportCompletion(job.job_id, "completed", "Update initiated. Agent detaching and restarting.");
      } catch (err) {
        console.warn(`[Agent ${this.hostname}] Could not report completion (network drop), but update is proceeding.`);
      }
      // Terminate so the file lock is released allowing the bat script to overwrite us
      process.exit(0);
    }

    // 3. Setup Windows Job Object (Simulated)
    console.log(`[Agent ${this.hostname}] Configuring JOBOBJECT_BASIC_LIMIT_INFORMATION (KILL_ON_JOB_CLOSE)...`);
    
    // 4. Execute in PowerShell Constrained Language Mode (Simulated)
    try {
      const executionResult = await Promise.race([
        WindowsSandbox.wrapInJobObject(async () => {
          console.log(`[Agent ${this.hostname}] Invoking PowerShell with __PSLockdownPolicy=4...`);
          // We pass tool_name for simplicity in testing as the command string
          return await WindowsSandbox.executeInConstrainedLanguageMode(job.tool_name);
        }),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("EXECUTION_TIMEOUT: Script exceeded maximum allowed execution time of 30000ms.")), 30000))
      ]);

      // Protect against Response Leakiness (Truncate massive outputs)
      const MAX_OUTPUT_SIZE = 50000;
      let finalOutput = executionResult;
      if (typeof executionResult === 'string' && executionResult.length > MAX_OUTPUT_SIZE) {
        console.warn(`[Agent ${this.hostname}] TRUNCATING massive output (size: ${executionResult.length} bytes) to prevent payload exhaustion.`);
        finalOutput = executionResult.substring(0, MAX_OUTPUT_SIZE) + "\n...[TRUNCATED BY AGENT GUARDRAIL]...";
      }

      console.log(`[Agent ${this.hostname}] Job ${job.job_id} executed successfully.`);
      await this.reportCompletion(job.job_id, "completed", { output: finalOutput });
    } catch (sandboxErr: any) {
      console.error(`[Agent ${this.hostname}] Execution Guardrail Blocked Job:`, sandboxErr.message);
      await this.reportCompletion(job.job_id, "failed", { error: sandboxErr.message });
    }
  }

  private async uploadArtifact(job_id: string, filePath: string): Promise<string> {
    // Check file existence
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found on agent: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    if (stat.size > 1024 * 1024 * 1024) { // 1GB Limit Guardrail
      throw new Error(`File exceeds maximum allowed exfiltration size (1GB). Size: ${stat.size} bytes`);
    }

    // In a real scenario, this would use a streamed FormData post to avoid memory exhaustion
    const uploadUrl = `${this.controlPlaneUrl}/api/agent/upload-artifact?job_id=${job_id}`;
    
    // Simulating the upload success
    const res = await fetch(uploadUrl, {
      method: "POST",
      body: JSON.stringify({ metadata: { name: path.basename(filePath), size: stat.size } }),
      headers: { "Content-Type": "application/json" }
    });

    if (!res.ok) throw new Error("Control plane rejected artifact stream");
    const data = await res.json();
    return data.downloadUrl;
  }

  private async performSelfUpdate(job: any) {
    const downloadUrl = `${this.controlPlaneUrl}/api/agent/download-latest`;
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error("Failed to download new binary");
    
    let buffer: Buffer;
    try {
      const arrayBuffer = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } catch (err) {
      throw new Error("Network interrupted during binary download");
    }
    
    const currentExePath = process.execPath;
    const currentDir = process.cwd();
    
    const isCompiled = currentExePath.toLowerCase().endsWith("zerotrustagent.exe");
    const targetExe = isCompiled ? currentExePath : path.join(currentDir, "ZeroTrustAgent.exe");
    const tempExe = targetExe + ".new";
    
    try {
      fs.writeFileSync(tempExe, buffer);
    } catch (err: any) {
      throw new Error(`File system error writing binary: ${err.message}`);
    }
    
    const batPath = path.join(currentDir, "updater.bat");
    // Enhanced bat script with rollback capability
    const batContent = `
@echo off
timeout /t 2 /nobreak > NUL
move /y "${targetExe}" "${targetExe}.bak"
move /y "${tempExe}" "${targetExe}"
start "" "${targetExe}"
del "%~f0"
    `.trim();
    
    try {
      fs.writeFileSync(batPath, batContent);
    } catch (err: any) {
      throw new Error(`File system error writing updater script: ${err.message}`);
    }
    
    // Spawn the bat file detached from the current Node event loop
    try {
      const child = spawn("cmd.exe", ["/c", batPath], {
          detached: true,
          stdio: "ignore",
          cwd: currentDir
      });
      child.unref();
    } catch (err: any) {
      throw new Error(`Process spawn error: ${err.message}`);
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
