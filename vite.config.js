import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Loads .env file into process.env if not already set.
 */
function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

/**
 * Vite plugin that routes /api/* requests to serverless handler functions in dev mode.
 */
function apiDevPlugin() {
  return {
    name: "vite-plugin-vercel-api-routes",
    configureServer(server) {
      loadLocalEnv();

      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith("/api/")) {
          return next();
        }

        const parsedUrl = new URL(req.url, "http://localhost");
        const routeName = parsedUrl.pathname.replace(/^\/api\//, "").replace(/\.js$/, "");

        if (!["movies", "filters", "analytics"].includes(routeName)) {
          return next();
        }

        try {
          const handlerModule = await server.ssrLoadModule(`/api/${routeName}.js`);
          const handler = handlerModule.default || handlerModule;

          // Format req.query
          const query = {};
          for (const key of parsedUrl.searchParams.keys()) {
            const allValues = parsedUrl.searchParams.getAll(key);
            query[key] = allValues.length > 1 ? allValues : allValues[0];
          }
          req.query = query;

          // Add status and json helpers for serverless handler compatibility
          if (!res.status) {
            res.status = (code) => {
              res.statusCode = code;
              return res;
            };
          }
          if (!res.json) {
            res.json = (data) => {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(data));
              return res;
            };
          }

          await handler(req, res);
        } catch (err) {
          console.error(`[API Dev Server] Error in /api/${routeName}:`, err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message || "Internal server error" }));
          }
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiDevPlugin()],
});
