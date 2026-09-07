import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as child_process from "child_process";
import { RemoteExecutionAgent } from "../src/lib/mcp-agent";
import { signJobPayload, ORCHESTRATOR_PUBLIC_KEY_B64 } from "../src/lib/orchestrator/crypto";

vi.mock("fs", () => ({
  writeFileSync: vi.fn(),
}));

vi.mock("child_process", () => ({
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

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

    it("[Agent-Update-1] should successfully intercept and process __system_update_agent", async () => {
      const mockFetch = vi.mocked(global.fetch);
      const timestamp = Date.now();
      const signature = signJobPayload("HOST-EXEC", "__system_update_agent", {}, timestamp);

      const agent = new RemoteExecutionAgent(url, "HOST-EXEC", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
      (agent as any).agentId = "mock-id";

      // Mock poll
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job: {
            job_id: "update-job-123",
            tool_name: "__system_update_agent",
            parameters: {},
            timestamp: timestamp,
            orchestrator_signature: signature,
            mcp_traceparent: "trace-123"
          }
        })
      } as any);

      // Mock download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10)
      } as any);

      // Mock reportCompletion fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as any);

      // Spies
      const spyWriteFileSync = vi.mocked(fs.writeFileSync);
      const spySpawn = vi.mocked(child_process.spawn);
      const spyExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

      await (agent as any).poll();

      expect(spyWriteFileSync).toHaveBeenCalledTimes(2); // exe and bat
      expect(spySpawn).toHaveBeenCalledTimes(1);
      expect(spySpawn).toHaveBeenCalledWith("cmd.exe", expect.any(Array), expect.objectContaining({ detached: true }));
      expect(spyExit).toHaveBeenCalledWith(0);

      spyWriteFileSync.mockClear();
      spySpawn.mockClear();
      spyExit.mockRestore();
    });

    it("[Agent-Update-2] should handle binary download failure gracefully", async () => {
      const mockFetch = vi.mocked(global.fetch);
      const timestamp = Date.now();
      const signature = signJobPayload("HOST-EXEC", "__system_update_agent", {}, timestamp);

      const agent = new RemoteExecutionAgent(url, "HOST-EXEC", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
      (agent as any).agentId = "mock-id";

      // Mock poll
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job: {
            job_id: "update-job-123",
            tool_name: "__system_update_agent",
            parameters: {},
            timestamp: timestamp,
            orchestrator_signature: signature,
            mcp_traceparent: "trace-123"
          }
        })
      } as any);

      // Mock download FAILING
      mockFetch.mockResolvedValueOnce({
        ok: false,
      } as any);

      // Mock reportCompletion fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as any);

      const spyWriteFileSync = vi.mocked(fs.writeFileSync);
      const spySpawn = vi.mocked(child_process.spawn);
      const spyExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

      const spyReport = vi.spyOn(agent as any, "reportCompletion");

      await (agent as any).poll();

      expect(spyWriteFileSync).not.toHaveBeenCalled();
      expect(spySpawn).not.toHaveBeenCalled();
      expect(spyExit).not.toHaveBeenCalled();
      
      expect(spyReport).toHaveBeenCalledWith("update-job-123", "failed", expect.objectContaining({ error: "Failed to download new binary" }));

      spyWriteFileSync.mockClear();
      spySpawn.mockClear();
      spyExit.mockRestore();
    });

    it("[Agent-Update-3] should handle network drop DURING binary download", async () => {
      const mockFetch = vi.mocked(global.fetch);
      const timestamp = Date.now();
      const signature = signJobPayload("HOST-EXEC", "__system_update_agent", {}, timestamp);

      const agent = new RemoteExecutionAgent(url, "HOST-EXEC", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
      (agent as any).agentId = "mock-id";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job: { job_id: "update-job-3", tool_name: "__system_update_agent", parameters: {}, timestamp, orchestrator_signature: signature, mcp_traceparent: "trace" }
        })
      } as any);

      // Download starts but arrayBuffer throws
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => { throw new Error("Connection reset"); }
      } as any);

      mockFetch.mockResolvedValueOnce({ ok: true } as any);

      const spyReport = vi.spyOn(agent as any, "reportCompletion");
      const spyExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

      await (agent as any).poll();
      expect(spyReport).toHaveBeenCalledWith("update-job-3", "failed", expect.objectContaining({ error: "Network interrupted during binary download" }));
      expect(spyExit).not.toHaveBeenCalled();
    });

    it("[Agent-Update-4] should handle file system write permissions error", async () => {
      const mockFetch = vi.mocked(global.fetch);
      const timestamp = Date.now();
      const signature = signJobPayload("HOST-EXEC", "__system_update_agent", {}, timestamp);

      const agent = new RemoteExecutionAgent(url, "HOST-EXEC", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
      (agent as any).agentId = "mock-id";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job: { job_id: "update-job-4", tool_name: "__system_update_agent", parameters: {}, timestamp, orchestrator_signature: signature, mcp_traceparent: "trace" }
        })
      } as any);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10)
      } as any);

      mockFetch.mockResolvedValueOnce({ ok: true } as any);

      const spyWriteFileSync = vi.mocked(fs.writeFileSync).mockImplementationOnce(() => {
        throw new Error("EACCES: permission denied");
      });
      const spyExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
      const spyReport = vi.spyOn(agent as any, "reportCompletion");

      await (agent as any).poll();
      expect(spyReport).toHaveBeenCalledWith("update-job-4", "failed", expect.objectContaining({ error: "File system error writing binary: EACCES: permission denied" }));
      expect(spyExit).not.toHaveBeenCalled();
      
      spyWriteFileSync.mockClear();
      spyExit.mockRestore();
    });

    it("[Agent-Update-5] should continue with update and restart even if reporting completion fails", async () => {
      const mockFetch = vi.mocked(global.fetch);
      const timestamp = Date.now();
      const signature = signJobPayload("HOST-EXEC", "__system_update_agent", {}, timestamp);

      const agent = new RemoteExecutionAgent(url, "HOST-EXEC", ORCHESTRATOR_PUBLIC_KEY_B64, "priv");
      (agent as any).agentId = "mock-id";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job: { job_id: "update-job-5", tool_name: "__system_update_agent", parameters: {}, timestamp, orchestrator_signature: signature, mcp_traceparent: "trace" }
        })
      } as any);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10)
      } as any);

      const spyWriteFileSync = vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      const spySpawn = vi.mocked(child_process.spawn).mockImplementation(() => ({ unref: vi.fn() }) as any);
      const spyExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

      const spyReport = vi.spyOn(agent as any, "reportCompletion").mockRejectedValue(new Error("Network drop during reporting"));

      await (agent as any).poll();

      // Even though reporting failed, the update MUST proceed and process.exit(0) must be called
      expect(spySpawn).toHaveBeenCalled();
      expect(spyExit).toHaveBeenCalledWith(0);

      spyWriteFileSync.mockClear();
      spySpawn.mockClear();
      spyExit.mockRestore();
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
