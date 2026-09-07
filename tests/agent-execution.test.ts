import { describe, it, expect, vi } from "vitest";
import { RemoteExecutionAgent } from "../src/lib/mcp-agent";
import { signJobPayload, ORCHESTRATOR_PUBLIC_KEY_B64 } from "../src/lib/orchestrator/crypto";

describe("Agent Real-World Execution Constraints Suite", () => {
  const url = "http://localhost:3000";

  it("[Exec-Limit-1] should successfully truncate massive output (Response Leakiness Prevention)", async () => {
    global.fetch = vi.fn();
    const mockFetch = vi.mocked(global.fetch);
    const timestamp = Date.now();
    const signature = signJobPayload("HOST-EXEC", "massive_output", {}, timestamp);

    const agent = new RemoteExecutionAgent(url, "HOST-EXEC", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
    (agent as any).agentId = "mock-id";

    // Mock poll
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        job: { job_id: "leak-job-1", tool_name: "massive_output", parameters: {}, timestamp, orchestrator_signature: signature, mcp_traceparent: "trace-1" }
      })
    } as any);

    const spyReport = vi.spyOn(agent as any, "reportCompletion").mockResolvedValueOnce(undefined);

    await (agent as any).poll();

    expect(spyReport).toHaveBeenCalledWith("leak-job-1", "completed", expect.objectContaining({
      output: expect.stringContaining("...[TRUNCATED BY AGENT GUARDRAIL]...")
    }));
    
    // Validate output size is strictly bounded
    const callArgs = spyReport.mock.calls[0];
    const reportedOutput = callArgs[2].output;
    expect(reportedOutput.length).toBeLessThanOrEqual(50000 + 100); // 50k + truncate message
  });

  it("[Exec-Limit-2] should catch and report script timeouts (Infinite Loop Prevention)", async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
    const mockFetch = vi.mocked(global.fetch);
    const timestamp = Date.now();
    const signature = signJobPayload("HOST-EXEC", "infinite_loop", {}, timestamp);

    const agent = new RemoteExecutionAgent(url, "HOST-EXEC", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
    (agent as any).agentId = "mock-id";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        job: { job_id: "hang-job-1", tool_name: "infinite_loop", parameters: {}, timestamp, orchestrator_signature: signature, mcp_traceparent: "trace-2" }
      })
    } as any);

    const spyReport = vi.spyOn(agent as any, "reportCompletion").mockResolvedValueOnce(undefined);

    const pollPromise = (agent as any).poll();
    
    // Fast-forward time to trigger the 30s timeout in Promise.race
    await vi.advanceTimersByTimeAsync(31000);
    await pollPromise;

    expect(spyReport).toHaveBeenCalledWith("hang-job-1", "failed", expect.objectContaining({
      error: "EXECUTION_TIMEOUT: Script exceeded maximum allowed execution time of 30000ms."
    }));
    
    vi.useRealTimers();
  });

  it("[Exec-Limit-3] should block execution needing elevated privileges (Access Denied)", async () => {
    global.fetch = vi.fn();
    const mockFetch = vi.mocked(global.fetch);
    const timestamp = Date.now();
    const signature = signJobPayload("HOST-EXEC", "requires_admin_flag", {}, timestamp);

    const agent = new RemoteExecutionAgent(url, "HOST-EXEC", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
    (agent as any).agentId = "mock-id";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        job: { job_id: "priv-job-1", tool_name: "requires_admin_flag", parameters: {}, timestamp, orchestrator_signature: signature, mcp_traceparent: "trace-3" }
      })
    } as any);

    const spyReport = vi.spyOn(agent as any, "reportCompletion").mockResolvedValueOnce(undefined);
    await (agent as any).poll();

    expect(spyReport).toHaveBeenCalledWith("priv-job-1", "failed", expect.objectContaining({
      error: expect.stringContaining("ACCESS_DENIED")
    }));
  });

  it("[Exec-Limit-4] should trap and report PowerShell syntax/parsing errors", async () => {
    global.fetch = vi.fn();
    const mockFetch = vi.mocked(global.fetch);
    const timestamp = Date.now();
    const signature = signJobPayload("HOST-EXEC", "has_syntax_err_inside", {}, timestamp);

    const agent = new RemoteExecutionAgent(url, "HOST-EXEC", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
    (agent as any).agentId = "mock-id";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        job: { job_id: "syntax-job-1", tool_name: "has_syntax_err_inside", parameters: {}, timestamp, orchestrator_signature: signature, mcp_traceparent: "trace-4" }
      })
    } as any);

    const spyReport = vi.spyOn(agent as any, "reportCompletion").mockResolvedValueOnce(undefined);
    await (agent as any).poll();

    expect(spyReport).toHaveBeenCalledWith("syntax-job-1", "failed", expect.objectContaining({
      error: expect.stringContaining("PARSE_ERROR")
    }));
  });

  it("[Exec-Limit-5] should drop payloads with tampered parameters (Signature Verification Failure)", async () => {
    global.fetch = vi.fn();
    const mockFetch = vi.mocked(global.fetch);
    const timestamp = Date.now();
    
    // Sign payload with good parameters
    const signature = signJobPayload("HOST-EXEC", "good_command", { val: 1 }, timestamp);

    const agent = new RemoteExecutionAgent(url, "HOST-EXEC", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
    (agent as any).agentId = "mock-id";

    // MOCK TAMPERING: The man-in-the-middle changed val to 999, but left the original signature
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        job: { job_id: "tamper-job-1", tool_name: "good_command", parameters: { val: 999 }, timestamp, orchestrator_signature: signature, mcp_traceparent: "trace-5" }
      })
    } as any);

    const spyReport = vi.spyOn(agent as any, "reportCompletion").mockResolvedValueOnce(undefined);
    await (agent as any).poll();

    expect(spyReport).toHaveBeenCalledWith("tamper-job-1", "failed", "Invalid Signature");
  });

  it("[Exec-Limit-6] should drop payloads mitigating replay attacks (Stale Timestamp)", async () => {
    global.fetch = vi.fn();
    const mockFetch = vi.mocked(global.fetch);
    
    // MOCK REPLAY: Timestamp is 6 minutes old (greater than the 300,000ms window)
    const staleTimestamp = Date.now() - (6 * 60 * 1000); 
    const signature = signJobPayload("HOST-EXEC", "good_command", {}, staleTimestamp);

    const agent = new RemoteExecutionAgent(url, "HOST-EXEC", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
    (agent as any).agentId = "mock-id";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        job: { job_id: "replay-job-1", tool_name: "good_command", parameters: {}, timestamp: staleTimestamp, orchestrator_signature: signature, mcp_traceparent: "trace-6" }
      })
    } as any);

    const spyReport = vi.spyOn(agent as any, "reportCompletion").mockResolvedValueOnce(undefined);
    await (agent as any).poll();

    expect(spyReport).toHaveBeenCalledWith("replay-job-1", "failed", "Invalid Signature");
  });
});
