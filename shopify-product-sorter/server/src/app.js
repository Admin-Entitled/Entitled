import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { requireRouteAuth } from "./middleware/authBoundary.js";
import { errorNormalizer } from "./middleware/errorBoundary.js";
import apiRouter from "./routes/api.js";
import orderMappingRouter from "./routes/orderMapping.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, "../../client/dist");

app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigin = env.clientOrigin;
      if (!origin) {
        callback(null, true);
        return;
      }
      if (
        origin === allowedOrigin ||
        (env.nodeEnv !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      ) {
        callback(null, true);
      } else {
        callback(new Error("CORS policy: Origin not allowed"), false);
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Token", "X-Admin-Secret"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }),
);
app.use(express.json({ limit: "30mb" }));
app.use("/api", requireRouteAuth);
app.use("/api", apiRouter);
app.use("/api/order-mapping", orderMappingRouter);
app.get("/delivery-resolution", (req, res) => res.redirect(302, env.orderMappingRoute));

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

// Global normalized error handler
app.use(errorNormalizer);

export default app;
