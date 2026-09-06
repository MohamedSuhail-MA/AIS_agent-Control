import { describe, it, expect, vi } from "vitest";
import { RemoteExecutionAgent } from "../src/lib/mcp-agent";
import { signJobPayload, ORCHESTRATOR_PUBLIC_KEY_B64 } from "../src/lib/orchestrator/crypto";

describe("Edge Agent Logic Extremely Extensive Suite", () => {
  const url = "http://localhost:3000";

  // Mock global fetch
  global.fetch = vi.fn();

  describe("Agent Registration & Bootstrapping", () => {
    it("[Agent-Reg-1] should successfully register and parse agent ID", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agent_id: "mock-agent-123" })
      } as any);

      const agent = new RemoteExecutionAgent(url, "HOST-1", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
      await agent.register();
      expect((agent as any).agentId).toBe("mock-agent-123");
    });

    it("[Agent-Reg-2] should handle registration failure gracefully", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
      } as any);

      const agent = new RemoteExecutionAgent(url, "HOST-2", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
      await agent.register();
      expect((agent as any).agentId).toBeNull();
    });
  });

  describe("Polling & Execution Flow", () => {
    const validSignScenarios = [
      { name: "Standard cmd", params: { cmd: "dir" } },
      { name: "Complex cmd", params: { cmd: "Get-Process | Where-Object { $_.CPU -gt 10 }" } },
      { name: "Null params", params: {} },
      { name: "Large params", params: { payload: "x".repeat(1000) } },
    ];

    validSignScenarios.forEach((tc, i) => {
      it(`[Agent-Exec-${i+1}] should poll, verify, and execute job: ${tc.name}`, async () => {
        const mockFetch = vi.mocked(global.fetch);
        const timestamp = Date.now();
        const signature = signJobPayload("HOST-EXEC", "action", tc.params, timestamp);

        // Setup agent with mock ID
        const agent = new RemoteExecutionAgent(url, "HOST-EXEC", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
        (agent as any).agentId = "mock-id";

        // Spy on internal executeJob and reportCompletion to prevent waiting 2 seconds on setTimeout
        const spyExecute = vi.spyOn(agent as any, "executeJob");
        const spyReport = vi.spyOn(agent as any, "reportCompletion").mockResolvedValue(undefined);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            job: {
              job_id: `job-${i}`,
              tool_name: "action",
              parameters: tc.params,
              timestamp: timestamp,
              orchestrator_signature: signature,
              mcp_traceparent: "trace-123"
            }
          })
        } as any);

        await (agent as any).poll();
        
        expect(spyExecute).toHaveBeenCalled();
      });
    });

    it("[Agent-Poll-1] should not throw if poll returns no job", async () => {
      const mockFetch = vi.mocked(global.fetch);
      const agent = new RemoteExecutionAgent(url, "HOST-EXEC", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
      (agent as any).agentId = "mock-id";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job: null })
      } as any);

      await expect((agent as any).poll()).resolves.not.toThrow();
    });

    it("[Agent-Poll-2] should not throw if fetch fails during poll", async () => {
      const mockFetch = vi.mocked(global.fetch);
      const agent = new RemoteExecutionAgent(url, "HOST-EXEC", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
      (agent as any).agentId = "mock-id";

      mockFetch.mockRejectedValueOnce(new Error("Network Error"));

      await expect((agent as any).poll()).resolves.not.toThrow();
    });
  });

  describe("Polling Lifecycle Methods", () => {
    it("[Agent-Life-1] should not start polling without an agent ID", () => {
      const agent = new RemoteExecutionAgent(url, "HOST-LIFE", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
      agent.startPolling(100);
      expect((agent as any).isPolling).toBe(false);
      expect((agent as any).intervalId).toBeNull();
    });

    it("[Agent-Life-2] should start and stop polling properly", () => {
      vi.useFakeTimers();
      const agent = new RemoteExecutionAgent(url, "HOST-LIFE", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
      (agent as any).agentId = "mock-id";

      agent.startPolling(100);
      expect((agent as any).isPolling).toBe(true);
      expect((agent as any).intervalId).not.toBeNull();

      agent.stopPolling();
      expect((agent as any).isPolling).toBe(false);
      expect((agent as any).intervalId).toBeNull();
      vi.useRealTimers();
    });
  });
});
