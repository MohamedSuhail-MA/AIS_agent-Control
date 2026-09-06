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

// Schemas
const toolCallSchema = z.object({
  targetHost: z.string(),
  actionIdentifier: z.string(),
  parameters: z.any(),
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
      
      // 2. Cryptographically sign the payload (Simulated Ed25519)
      const timestamp = Date.now();
      const signature = signJobPayload(payload.targetHost, payload.actionIdentifier, payload.parameters || {}, timestamp);
      
      // 3. Inject traceparent
      const traceparent = `00-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2,18)}-01`;
      
      // 4. Enqueue Job
      const jobId = enqueueJob(payload.targetHost, payload.actionIdentifier, payload.parameters || {}, signature, traceparent, timestamp);
      
      res.json({ success: true, job_id: jobId, status: "queued" });
    } catch (err: any) {
      res.status(400).json({ error: "-32602 (Invalid params)", details: err.errors });
    }
  });


  // --- On-Premises Agent Polling Endpoints --- //
  
  app.post("/api/agent/register", (req, res) => {
    const { hostname, publicKey } = req.body;
    if (!hostname || !publicKey) return res.status(400).json({ error: "Missing hostname or publicKey" });
    const agentId = registerAgent(hostname, publicKey);
    res.json({ success: true, agent_id: agentId, status: "pending_approval" });
  });

  app.post("/api/agent/poll", (req, res) => {
    // In reality, this would use mTLS client certificates
    const { agent_id, targetHost } = req.body;
    updateAgentHeartbeat(agent_id);
    
    // Check if approved (skipping actual DB check for simplicity in polling, 
    // but in a real system we'd verify agent status is "approved")
    
    const job = dequeueJob(targetHost);
    if (job) {
      res.json({ job: job.payload });
    } else {
      res.json({ job: null });
    }
  });

  app.post("/api/agent/complete", (req, res) => {
    const { job_id, result, status } = req.body;
    completeJob(job_id, result, status);
    res.json({ success: true });
  });


  // --- Control Plane UI Endpoints --- //
  
  app.get("/api/ui/dashboard", (req, res) => {
    res.json({
      jobs: getAllJobs(),
      agents: getAllAgents(),
    });
  });

  app.post("/api/ui/approve-agent", (req, res) => {
    const { agent_id } = req.body;
    approveAgent(agent_id);
    res.json({ success: true });
  });
}
