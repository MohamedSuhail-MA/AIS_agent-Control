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
  status: "pending" | "approved" | "rejected";
  last_seen: number;
}

// In-memory simulated PostgreSQL tables
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

export function enqueueJob(targetHost: string, tool_name: string, parameters: any, signature: string, traceparent: string): string {
  const job_id = uuidv4();
  const payload: JobPayload = {
    job_id,
    mcp_traceparent: traceparent,
    tool_name,
    parameters,
    orchestrator_signature: signature,
    timestamp: Date.now(),
  };

  const record: JobRecord = {
    id: job_id,
    payload,
    status: "pending",
    visible_at: 0,
    created_at: Date.now(),
    targetHost,
  };

  jobs.set(job_id, record);
  return job_id;
}

export function completeJob(job_id: string, result: any, status: "completed" | "failed") {
  const job = jobs.get(job_id);
  if (job) {
    job.status = status;
    job.result = result;
  }
}

export function registerAgent(hostname: string, publicKey: string): string {
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
  if (agent) {
    agent.last_seen = Date.now();
  }
}

export function getAllJobs() {
  return Array.from(jobs.values()).sort((a, b) => b.created_at - a.created_at);
}

export function getAllAgents() {
  return Array.from(agents.values()).sort((a, b) => b.last_seen - a.last_seen);
}
