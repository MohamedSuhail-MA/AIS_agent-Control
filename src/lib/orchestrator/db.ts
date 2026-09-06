import { v4 as uuidv4 } from "uuid";

// Simulated PostgreSQL JSONB payload
export interface JobPayload {
  job_id: string;
  mcp_traceparent: string;
  tool_name: string;
  parameters: any;
  orchestrator_signature: string;
  timestamp: number;
}

export type JobStatus = "pending" | "in_progress" | "completed" | "failed";

export interface JobRecord {
  id: string;
  payload: JobPayload;
  status: JobStatus;
  visible_at: number;
  result?: any;
  created_at: number;
  targetHost: string;
}

export interface AgentRecord {
  id: string;
  hostname: string;
  publicKey: string;
  status: "pending" | "approved" | "rejected" | "offline";
  last_seen: number;
}

// In-memory simulated PostgreSQL tables (with strict limits)
const MAX_JOBS = 10000;
const MAX_AGENTS = 5000;
const jobs: Map<string, JobRecord> = new Map();
const agents: Map<string, AgentRecord> = new Map();

// Helper to simulate SELECT ... FOR UPDATE SKIP LOCKED
export function dequeueJob(targetHost: string): JobRecord | null {
  const now = Date.now();
  
  // Find an eligible job
  for (const job of jobs.values()) {
    if (job.targetHost === targetHost && (job.status === "pending" || (job.status === "in_progress" && job.visible_at <= now))) {
      // "Lock" and update the job
      job.status = "in_progress";
      job.visible_at = now + 60 * 1000; // 60 seconds visibility timeout
      return job;
    }
  }
  return null;
}

export function enqueueJob(targetHost: string, tool_name: string, parameters: any, signature: string, traceparent: string, timestamp: number): string {
  if (jobs.size >= MAX_JOBS) {
    throw new Error("Job queue is full. Max capacity reached.");
  }
  const job_id = uuidv4();
  const payload: JobPayload = {
    job_id,
    mcp_traceparent: traceparent,
    tool_name,
    parameters,
    orchestrator_signature: signature,
    timestamp: timestamp,
  };

  const record: JobRecord = {
    id: job_id,
    payload,
    status: "pending",
    visible_at: 0,
    created_at: timestamp || Date.now(),
    targetHost,
  };

  jobs.set(job_id, record);
  return job_id;
}

export function completeJob(job_id: string, result: any, status: "completed" | "failed") {
  const job = jobs.get(job_id);
  if (job && job.status === "in_progress") {
    job.status = status;
    job.result = result;
    job.visible_at = 0;
  }
}

export function deleteOldJobs(retentionMs: number): number {
  const now = Date.now();
  let deletedCount = 0;
  for (const [jobId, job] of jobs.entries()) {
    if ((job.status === "completed" || job.status === "failed") && (now - job.created_at > retentionMs)) {
      jobs.delete(jobId);
      deletedCount++;
    }
  }
  return deletedCount;
}

export function registerAgent(hostname: string, publicKey: string): string {
  // Check if agent already exists for this host to avoid duplicate ghost agents
  for (const [id, agent] of agents.entries()) {
    if (agent.hostname === hostname) {
      agent.publicKey = publicKey;
      agent.status = "pending";
      agent.last_seen = Date.now();
      return id;
    }
  }

  if (agents.size >= MAX_AGENTS) {
    throw new Error("Agent registry is full. Max capacity reached.");
  }

  const agent_id = uuidv4();
  agents.set(agent_id, {
    id: agent_id,
    hostname,
    publicKey,
    status: "pending",
    last_seen: Date.now(),
  });
  return agent_id;
}

export function approveAgent(agent_id: string) {
  const agent = agents.get(agent_id);
  if (agent) {
    agent.status = "approved";
  }
}

export function updateAgentHeartbeat(agent_id: string) {
  const agent = agents.get(agent_id);
  if (agent && agent.status !== "rejected") {
    agent.last_seen = Date.now();
    if (agent.status === "offline") {
      agent.status = "approved"; // Recover from offline if heartbeat resumes
    }
  }
}

export function getAllJobs() {
  // Limit output to prevent event loop blocking on huge maps
  const maxOutput = 500;
  return Array.from(jobs.values())
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, maxOutput);
}

export function getAllAgents() {
  return Array.from(agents.values()).sort((a, b) => b.last_seen - a.last_seen);
}
