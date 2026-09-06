import { describe, it, expect, beforeEach } from "vitest";
import { HealthSweeper } from "../src/lib/orchestrator/sweeper";
import { registerAgent, enqueueJob, dequeueJob, approveAgent, getAllAgents, getAllJobs, completeJob } from "../src/lib/orchestrator/db";

describe("Health Sweeper Subsystem", () => {
  beforeEach(() => {
    // Reset or isolate context via unique identifiers
  });

  it("[Sweeper-1] should mark stale agents as offline", () => {
    const agentId = registerAgent("SWEEP-HOST-1", "pub-key");
    approveAgent(agentId);
    
    // Fake the agent being old
    const agents = getAllAgents();
    const agent = agents.find(a => a.id === agentId);
    if (agent) {
      agent.last_seen = Date.now() - 40000; // 40 seconds ago
    }

    const sweptCount = HealthSweeper.sweepOfflineAgents(30000); // 30s threshold
    expect(sweptCount).toBeGreaterThanOrEqual(1);

    const checkAgent = getAllAgents().find(a => a.id === agentId);
    expect(checkAgent?.status).toBe("offline");
  });

  it("[Sweeper-2] should not mark fresh agents as offline", () => {
    const agentId = registerAgent("SWEEP-HOST-2", "pub-key");
    approveAgent(agentId);
    
    // Fresh agent (just registered)
    const sweptCount = HealthSweeper.sweepOfflineAgents(30000); 
    
    // It shouldn't sweep THIS agent. (sweptCount might be >0 if other tests left stale ones)
    const checkAgent = getAllAgents().find(a => a.id === agentId);
    expect(checkAgent?.status).toBe("approved");
  });

  it("[Sweeper-3] should reset stale jobs back to pending", () => {
    const jobId = enqueueJob("SWEEP-HOST-3", "action", {}, "sig", "trace", Date.now());
    
    // Dequeue (locks it)
    const job = dequeueJob("SWEEP-HOST-3");
    expect(job).toBeDefined();
    
    // Fake it timing out while in_progress
    if (job) {
      job.visible_at = Date.now() - 10000; // Passed visibility timeout
    }

    const sweptCount = HealthSweeper.sweepStaleJobs(0); // aggressive timeout for test
    expect(sweptCount).toBeGreaterThanOrEqual(1);

    const jobs = getAllJobs();
    const checkJob = jobs.find(j => j.id === jobId);
    expect(checkJob?.status).toBe("pending");
    expect(checkJob?.visible_at).toBe(0);
  });
});
