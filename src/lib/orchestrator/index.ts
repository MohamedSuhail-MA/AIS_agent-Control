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
        },
        {
          name: "upload_artifact",
          description: "Securely stream large files (crash dumps, massive IIS logs, memory dumps) back to the Control Plane avoiding the 50KB payload limit.",
          inputSchema: {
            type: "object",
            properties: {
              targetHost: { type: "string" },
              actionIdentifier: { type: "string", enum: ["__system_upload_artifact"] },
              parameters: { 
                type: "object",
                properties: { filePath: { type: "string" } }
              }
            },
            required: ["targetHost", "actionIdentifier"]
          }
        },
        {
          name: "get_system_metrics",
          description: "Retrieves CPU, RAM, and Disk Drive space consumption metrics.",
          inputSchema: {
            type: "object",
            properties: {
              targetHost: { type: "string" },
              actionIdentifier: { type: "string", enum: ["metrics"] },
              parameters: { type: "object" }
            },
            required: ["targetHost", "actionIdentifier"]
          }
        },
        {
          name: "analyze_event_viewer",
          description: "Queries Windows Event Viewer for Application, Security, Setup, or System logs.",
          inputSchema: {
            type: "object",
            properties: {
              targetHost: { type: "string" },
              actionIdentifier: { type: "string", enum: ["event_logs"] },
              parameters: { 
                type: "object",
                properties: {
                  logName: { type: "string", enum: ["System", "Application", "Security"] },
                  level: { type: "string", enum: ["Critical", "Error", "Warning", "Information"] }
                }
              }
            },
            required: ["targetHost", "actionIdentifier"]
          }
        },
        {
          name: "manage_services",
          description: "Manage Windows Services like MSMQ, Print Spooler, W3SVC (IIS), etc.",
          inputSchema: {
            type: "object",
            properties: {
              targetHost: { type: "string" },
              actionIdentifier: { type: "string", enum: ["manage_service"] },
              parameters: { 
                type: "object",
                properties: {
                  serviceName: { type: "string" },
                  action: { type: "string", enum: ["start", "stop", "restart", "status"] }
                }
              }
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

  app.post("/api/ui/update-agent", (req, res) => {
    try {
      const { agent_id } = uiApproveSchema.parse(req.body);
      
      const agents = getAllAgents();
      const agent = agents.find(a => a.id === agent_id);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      // Enqueue the system update job
      const timestamp = Date.now();
      const signature = signJobPayload(agent.hostname, "__system_update_agent", {}, timestamp);
      const traceparent = `00-${randomBytes(16).toString("hex")}-${randomBytes(8).toString("hex")}-01`;
      
      enqueueJob(agent.hostname, "__system_update_agent", {}, signature, traceparent, timestamp);
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: "Invalid update payload", details: err.errors });
    }
  });

  // Expose mock download route for the agent
  app.get("/api/agent/download-latest", (req, res) => {
    res.setHeader("Content-Disposition", 'attachment; filename="ZeroTrustAgent.exe"');
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(Buffer.from("MZ\x90\x00...mock_executable_content_for_update..."));
  });

  // Artifact Upload endpoint
  app.post("/api/agent/upload-artifact", (req, res) => {
    try {
      // In a real environment this would use busboy/multer to stream the file to an S3 bucket
      const { job_id } = req.query;
      res.json({ success: true, downloadUrl: `https://orchestrator.internal/artifacts/${job_id}/dump.dmp` });
    } catch (err: any) {
      res.status(500).json({ error: "Upload failed" });
    }
  });
}
