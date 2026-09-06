import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import { setupApiRoutes } from "../src/lib/orchestrator/index";
import { generateAgentKeyPair } from "../src/lib/agent/crypto";

describe("End-to-End System Integration Flow", () => {
  const app = express();
  app.use(express.json());
  setupApiRoutes(app);

  let agentId = "";
  const agentKeypair = generateAgentKeyPair();
  const targetHost = "E2E-WIN-HOST-01";
  let jobId = "";

  it("[E2E-1] Agent auto-enrolls via mTLS CSR", async () => {
    const res = await request(app)
      .post("/api/agent/register")
      .send({ hostname: targetHost, publicKey: agentKeypair.publicKey });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.agent_id).toBeDefined();
    agentId = res.body.agent_id;
  });

  it("[E2E-2] Human Admin approves the agent", async () => {
    const res = await request(app)
      .post("/api/ui/approve-agent")
      .send({ agent_id: agentId });
      
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("[E2E-3] LLM MCP payload is rejected by AIGuardrails", async () => {
    const res = await request(app)
      .post("/api/mcp/tools/call")
      .send({
        targetHost,
        actionIdentifier: "execute_remote_command",
        parameters: { command: "rm -rf /" }
      });
      
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Security Violation");
  });

  it("[E2E-4] Benign LLM MCP payload is enqueued", async () => {
    const res = await request(app)
      .post("/api/mcp/tools/call")
      .send({
        targetHost,
        actionIdentifier: "execute_remote_command",
        parameters: { command: "Get-Process | Where-Object CPU -gt 10" }
      });
      
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.job_id).toBeDefined();
    jobId = res.body.job_id;
  });

  it("[E2E-5] Agent polls and retrieves cryptographically signed job", async () => {
    const res = await request(app)
      .post("/api/agent/poll")
      .send({ agent_id: agentId, targetHost });
      
    expect(res.status).toBe(200);
    expect(res.body.job).toBeDefined();
    expect(res.body.job.job_id).toBe(jobId);
    expect(res.body.job.orchestrator_signature).toBeDefined();
    expect(res.body.job.mcp_traceparent).toBeDefined();
  });

  it("[E2E-6] Agent successfully completes job after Sandbox simulation", async () => {
    const res = await request(app)
      .post("/api/agent/complete")
      .send({
        job_id: jobId,
        status: "completed",
        result: { output: "Command executed safely: Get-Process | Where-Object CPU -gt 10" }
      });
      
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("[E2E-7] Control Plane UI reflects completed job status", async () => {
    const res = await request(app).get("/api/ui/dashboard");
    expect(res.status).toBe(200);
    
    const job = res.body.jobs.find((j: any) => j.id === jobId);
    expect(job).toBeDefined();
    expect(job.status).toBe("completed");
    expect(job.result.output).toContain("Command executed safely");
  });
});
