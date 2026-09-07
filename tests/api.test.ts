import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import { setupApiRoutes } from "../src/lib/orchestrator/index";

describe("Orchestrator Control Plane API (Supertest Suite)", () => {
  const app = express();
  
  beforeAll(() => {
    app.use(express.json());
    setupApiRoutes(app);
  });

  describe("GET /api/mcp/tools/list", () => {
    it("[API-Tools-1] should return standard MCP tool manifest", async () => {
      const res = await request(app).get("/api/mcp/tools/list");
      expect(res.status).toBe(200);
      expect(res.body.tools).toBeInstanceOf(Array);
      expect(res.body.tools.length).toBeGreaterThanOrEqual(1);
      const toolNames = res.body.tools.map((t: any) => t.name);
      expect(toolNames).toContain("execute_remote_command");
      expect(toolNames).toContain("upload_artifact");
    });
  });

  describe("POST /api/mcp/tools/call", () => {
    it("[API-Call-1] should reject invalid schemas", async () => {
      const res = await request(app)
        .post("/api/mcp/tools/call")
        .send({ missingHost: "yes" });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid params");
    });

    it("[API-Call-2] should accept valid schema and enqueue job", async () => {
      const res = await request(app)
        .post("/api/mcp/tools/call")
        .send({ 
          targetHost: "API-TEST-HOST-1", 
          actionIdentifier: "restart", 
          parameters: {} 
        });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.job_id).toBe("string");
    });
  });

  describe("Agent Lifecycle Endpoints", () => {
    let agentId: string;

    it("[API-Agent-1] should successfully register a new agent", async () => {
      const res = await request(app)
        .post("/api/agent/register")
        .send({ hostname: "API-TEST-HOST-1", publicKey: "key123" });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.agent_id).toBeDefined();
      agentId = res.body.agent_id;
    });

    it("[API-Agent-2] should fail registration without hostname", async () => {
      const res = await request(app)
        .post("/api/agent/register")
        .send({ publicKey: "key123" });
      
      expect(res.status).toBe(400);
    });

    it("[API-Agent-3] should approve the registered agent via UI endpoint", async () => {
      const res = await request(app)
        .post("/api/ui/approve-agent")
        .send({ agent_id: agentId });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("[API-Agent-4] should poll successfully for the enqueued job", async () => {
      const res = await request(app)
        .post("/api/agent/poll")
        .send({ agent_id: agentId, targetHost: "API-TEST-HOST-1" });
      
      expect(res.status).toBe(200);
      expect(res.body.job).toBeDefined();
      expect(res.body.job.tool_name).toBe("restart");
    });

    it("[API-Agent-5] should complete the polled job", async () => {
      // First we need the job id, let's poll again to get a job if it didn't finish, 
      // but wait, poll above dequeued it. We need to enqueue another one to test completion cleanly.
      const callRes = await request(app)
        .post("/api/mcp/tools/call")
        .send({ targetHost: "API-TEST-HOST-1", actionIdentifier: "restart", parameters: {} });
      
      const jobId = callRes.body.job_id;

      const compRes = await request(app)
        .post("/api/agent/complete")
        .send({ job_id: jobId, status: "completed", result: { out: "ok" } });
      
      expect(compRes.status).toBe(200);
      expect(compRes.body.success).toBe(true);
    });
  });

  describe("UI Dashboard Endpoints", () => {
    it("[API-UI-1] should fetch the dashboard data safely", async () => {
      const res = await request(app).get("/api/ui/dashboard");
      expect(res.status).toBe(200);
      expect(res.body.jobs).toBeInstanceOf(Array);
      expect(res.body.agents).toBeInstanceOf(Array);
    });
  });
});
