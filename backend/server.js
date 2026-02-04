import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from 'dotenv'
import { runKeepAlive } from "./scripts/supabaseKeepAlive.js";
import adminRoutes from "./routes/admin.js";
import adminAuthRoutes from "./routes/adminAuth.js";
import publicRoutes from "./routes/public.js";
import authRoutes from "./routes/auth.js";
import accessRoutes from "./routes/access.js";
import morgan from "morgan";
const app = express();

const allowedOrigins = [
  "https://entitled-admin-ui.onrender.com",
  "https://auth.entitledclub.com",
  "https://entitledclub.com",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
];

dotenv.config()
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS blocked"), false);
    },
    credentials: true,
  })
);

// app.use(cors())
app.use(morgan("dev"))
app.use(express.json());
app.use(cookieParser());

/**
 * ROUTES
 */
app.use("/admin", adminRoutes);
app.use("/admin/auth", adminAuthRoutes);
app.use("/auth", authRoutes);
app.use("/", accessRoutes);
app.use("/api", publicRoutes);
app.use("/", publicRoutes);

/**
 * HEALTH CHECK (important for Render)
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 4000;
const keepAliveEnabled = process.env.ENABLE_INTERNAL_KEEPALIVE === "true";
const keepAliveIntervalMs = Number(process.env.KEEPALIVE_INTERVAL_MS || 10 * 60 * 1000);
const keepAliveToken = process.env.KEEPALIVE_TOKEN;
let keepAliveRunning = false;

const executeKeepAlive = async (label) => {
  if (keepAliveRunning) return false;
  keepAliveRunning = true;
  try {
    await runKeepAlive();
    return true;
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] keepalive ${label} failed: ${error.message}`
    );
    return false;
  } finally {
    keepAliveRunning = false;
  }
};

app.get("/internal/keepalive", async (req, res) => {
  if (!keepAliveToken) {
    return res.status(500).json({ error: "KEEPALIVE_TOKEN is not configured" });
  }

  const token = req.get("x-keepalive-token") || req.query.token;
  if (token !== keepAliveToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (keepAliveRunning) {
    return res.status(202).json({ status: "already_running" });
  }

  const ok = await executeKeepAlive("endpoint");
  if (!ok) {
    return res.status(500).json({ status: "failed" });
  }
  return res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);

  if (!keepAliveEnabled) {
    return;
  }

  console.log(`🫀 Internal keepalive enabled (interval=${keepAliveIntervalMs}ms)`);

  executeKeepAlive("startup");

  setInterval(() => {
    executeKeepAlive("loop");
  }, keepAliveIntervalMs);
});
