import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { setupApiRoutes } from "./src/lib/orchestrator/index";
import { HealthSweeper } from "./src/lib/orchestrator/sweeper";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Strict JSON parsing with a 100kb limit to prevent payload-based DoS attacks
  app.use(express.json({ limit: "100kb" }));

  // Set up all API routes (Control Plane / Orchestrator)
  setupApiRoutes(app);

  // Start background health sweeps
  setInterval(() => {
    HealthSweeper.sweepOfflineAgents();
    HealthSweeper.sweepStaleJobs();
    HealthSweeper.sweepCompletedJobs();
  }, 10000);

  // Vite middleware for development

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Control Plane Server running on port ${PORT}`);
  });
}

startServer();
