import { randomBytes } from "crypto";
import { Express } from "express";
import { z } from "zod";
import { 
  dequeueJob, 
  enqueueJob, 
  completeJob, 
  registerAgent, 
  approveAgent, 
  updateAgentHeartbeat,
  getAllJobs,
  getAllAgents
} from "./db.js";
import { signJobPayload } from "./crypto.js";
import { AIGuardrails } from "./guardrails.js";

// Schemas
const toolCallSchema = z.object({
  targetHost: z.string().max(255),
  actionIdentifier: z.string().max(1024),
  parameters: z.any(),
});

const agentRegisterSchema = z.object({
  hostname: z.string().min(1).max(255),
  publicKey: z.string().min(1).max(2048)
});

const agentPollSchema = z.object({
  agent_id: z.string().uuid(),
  targetHost: z.string().max(255)
});

const agentCompleteSchema = z.object({
  job_id: z.string().uuid(),
  result: z.any(),
  status: z.enum(["completed", "failed"])
});

const uiApproveSchema = z.object({
  agent_id: z.string().uuid()
});

export function setupApiRoutes(app: Express) {
  
  // --- LLM Orchestrator Endpoints (MCP Provider) --- //
  
  app.get("/api/mcp/tools/list", (req, res) => {
    // Expose MCP standard tools manifest
    res.json({
      tools: [
        {
          name: "execute_remote_command",
          description: "Executes a secure command on a remote on-premises Windows host via the zero-trust agent.",
          inputSchema: {
            type: "object",
            properties: {
              targetHost: { type: "string" },
              actionIdentifier: { type: "string" },
              parameters: { type: "object" }
            },
            required: ["targetHost", "actionIdentifier"]
          }
        }
      ]
    });
  });

  app.post("/api/mcp/tools/call", (req, res) => {
    try {
      // 1. Validate JSON schema
      const payload = toolCallSchema.parse(req.body);
      
      // 1.5 Evaluate AI Guardrails
      const guardrailCheck = AIGuardrails.validatePayload(payload.targetHost, payload.actionIdentifier, payload.parameters);
      if (!guardrailCheck.valid) {
        return res.status(403).json({ error: "Security Violation", details: guardrailCheck.reason });
      }

      // 2. Cryptographically sign the payload (Simulated Ed25519)
      const timestamp = Date.now();
      const signature = signJobPayload(payload.targetHost, payload.actionIdentifier, payload.parameters || {}, timestamp);
      
      // 3. Inject traceparent
      const traceId = randomBytes(16).toString("hex");
      const spanId = randomBytes(8).toString("hex");
      const traceparent = `00-${traceId}-${spanId}-01`;
      
      // 4. Enqueue Job
      const jobId = enqueueJob(payload.targetHost, payload.actionIdentifier, payload.parameters || {}, signature, traceparent, timestamp);
      
      res.json({ success: true, job_id: jobId, status: "queued" });
    } catch (err: any) {
      res.status(400).json({ error: "-32602 (Invalid params)", details: err.errors });
    }
  });


  // --- On-Premises Agent Polling Endpoints --- //
  
  app.post("/api/agent/register", (req, res) => {
    try {
      const { hostname, publicKey } = agentRegisterSchema.parse(req.body);
      const agentId = registerAgent(hostname, publicKey);
      res.json({ success: true, agent_id: agentId, status: "pending_approval" });
    } catch (err: any) {
      res.status(400).json({ error: "Invalid registration payload", details: err.errors });
    }
  });

  app.post("/api/agent/poll", (req, res) => {
    try {
      // In reality, this would use mTLS client certificates
      const { agent_id, targetHost } = agentPollSchema.parse(req.body);
      
      const agents = getAllAgents();
      const agent = agents.find(a => a.id === agent_id);
      if (!agent) {
        return res.status(401).json({ error: "Unauthorized: Agent not found" });
      }
      if (agent.status !== "approved") {
        return res.status(403).json({ error: "Forbidden: Agent not approved" });
      }
      if (agent.hostname !== targetHost) {
        return res.status(400).json({ error: "Bad Request: Hostname mismatch" });
      }

      updateAgentHeartbeat(agent_id);
      
      const job = dequeueJob(targetHost);
      if (job) {
        res.json({ job: job.payload });
      } else {
        res.json({ job: null });
      }
    } catch (err: any) {
      res.status(400).json({ error: "Invalid polling payload", details: err.errors });
    }
  });

  app.post("/api/agent/complete", (req, res) => {
    try {
      const { job_id, result, status } = agentCompleteSchema.parse(req.body);
      completeJob(job_id, result, status);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: "Invalid completion payload", details: err.errors });
    }
  });


  // --- Control Plane UI Endpoints --- //
  
  app.get("/api/ui/dashboard", (req, res) => {
    res.json({
      jobs: getAllJobs(),
      agents: getAllAgents(),
    });
  });

  app.post("/api/ui/approve-agent", (req, res) => {
    try {
      const { agent_id } = uiApproveSchema.parse(req.body);
      
      const agents = getAllAgents();
      if (!agents.find(a => a.id === agent_id)) {
        return res.status(404).json({ error: "Agent not found" });
      }

      approveAgent(agent_id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: "Invalid approval payload", details: err.errors });
    }
  });
}
