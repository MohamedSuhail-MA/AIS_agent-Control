import { describe, it, expect, beforeEach } from "vitest";
import { enqueueJob, dequeueJob, completeJob, getAllJobs, registerAgent, approveAgent, getAllAgents, updateAgentHeartbeat } from "../src/lib/orchestrator/db";

describe("Database Queue & Concurrency Simulator Extensive Suite", () => {
  const hostBase = "CONCURRENCY-HOST";
  
  beforeEach(() => {
    // Relying on unique target hosts for isolation in shared in-memory DB
  });

  describe("Job Lifecycle & Locking", () => {
    // 20+ Tests for Enqueue/Dequeue/Locking
    for (let i = 1; i <= 20; i++) {
      it(`[DB-JobCycle-${i}] should properly transition job state from pending -> in_progress -> completed (Run ${i})`, () => {
        const host = `${hostBase}-LIFECYCLE-${i}`;
        const jobId = enqueueJob(host, "action", { run: i }, "sig", "trace", Date.now());
        
        // Initial state
        let all = getAllJobs();
        expect(all.find(j => j.id === jobId)?.status).toBe("pending");

        // Dequeue (Lock)
        const job = dequeueJob(host);
        expect(job).toBeDefined();
        expect(job?.id).toBe(jobId);
        expect(job?.status).toBe("in_progress");

        // Verify it is locked
        expect(dequeueJob(host)).toBeNull();

        // Complete
        completeJob(jobId, { success: true }, "completed");
        
        all = getAllJobs();
        expect(all.find(j => j.id === jobId)?.status).toBe("completed");
        expect(dequeueJob(host)).toBeNull(); // Still nothing to dequeue
      });
    }
  });

  describe("Visibility Timeout (SKIP LOCKED simulation)", () => {
    // Simulate timeouts
    const timeouts = [100, 500, 1000, 60000];
    timeouts.forEach((t, i) => {
      it(`[DB-Timeout-${i+1}] should unlock job if visible_at is in the past (Timeout simulation ${t}ms)`, () => {
        const host = `${hostBase}-TIMEOUT-${i}`;
        const jobId = enqueueJob(host, "action", {}, "sig", "trace", Date.now());
        
        const job = dequeueJob(host);
        expect(job).toBeDefined();
        
        // Manually simulate time passing beyond visible_at
        if (job) {
          job.visible_at = Date.now() - t; 
        }

        // Job should be available again
        const jobRetry = dequeueJob(host);
        expect(jobRetry).toBeDefined();
        expect(jobRetry?.id).toBe(jobId);
      });
    });
  });

  describe("Parallel Queue Dispatching", () => {
    it("[DB-Parallel-1] should distribute unique jobs to multiple polling requests without duplication", () => {
      const host = `${hostBase}-PARALLEL`;
      const numJobs = 50;
      
      // Enqueue 50 jobs
      const jobIds = Array.from({length: numJobs}).map((_, i) => 
        enqueueJob(host, `action-${i}`, {}, "sig", "trace", Date.now())
      );

      // Simulate 50 concurrent polls
      const dequeuedJobs = Array.from({length: numJobs}).map(() => dequeueJob(host));
      
      // Verify no duplicates and no nulls
      const dequeuedIds = dequeuedJobs.map(j => j?.id);
      const uniqueIds = new Set(dequeuedIds);
      
      expect(dequeuedJobs.every(j => j !== null)).toBe(true);
      expect(uniqueIds.size).toBe(numJobs);
      expect(dequeueJob(host)).toBeNull(); // Queue should be empty now
    });
  });

  describe("Agent Lifecycle & Identity", () => {
    for (let i = 1; i <= 10; i++) {
      it(`[DB-AgentCycle-${i}] should register, approve, and track heartbeat (Agent ${i})`, () => {
        const host = `AGENT-REG-HOST-${i}`;
        const key = `PUBKEY-${i}`;
        
        const beforeRegisterTime = Date.now();
        const agentId = registerAgent(host, key);
        expect(agentId).toBeDefined();

        let agents = getAllAgents();
        let agent = agents.find(a => a.id === agentId);
        expect(agent?.status).toBe("pending");
        expect(agent?.hostname).toBe(host);
        expect(agent?.publicKey).toBe(key);
        expect(agent?.last_seen).toBeGreaterThanOrEqual(beforeRegisterTime);

        approveAgent(agentId);
        agents = getAllAgents();
        agent = agents.find(a => a.id === agentId);
        expect(agent?.status).toBe("approved");

        const manualTime = Date.now() + 10000;
        // Mock time update
        const originalNow = Date.now;
        Date.now = () => manualTime;
        updateAgentHeartbeat(agentId);
        Date.now = originalNow; // Restore

        agents = getAllAgents();
        agent = agents.find(a => a.id === agentId);
        expect(agent?.last_seen).toBe(manualTime);
      });
    }
  });
});
