import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { setupApiRoutes } from "./src/lib/orchestrator/index";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Set up all API routes (Control Plane / Orchestrator)
  setupApiRoutes(app);

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
