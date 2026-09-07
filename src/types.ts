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
  completed_at?: number;
  targetHost: string;
}

export interface AgentRecord {
  id: string;
  hostname: string;
  publicKey: string;
  status: "pending" | "approved" | "rejected" | "offline";
  last_seen: number;
}
