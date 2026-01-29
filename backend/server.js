import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from 'dotenv'
import adminRoutes from "./routes/admin.js";
import adminAuthRoutes from "./routes/adminAuth.js";
import publicRoutes from "./routes/public.js";

const app = express();

const allowedOrigins = [
  "https://entitled-admin-ui.onrender.com",
  "https://auth.entitledclub.com",
  "https://entitledclub.com",
  "http://localhost:5173",
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

app.use(express.json());
app.use(cookieParser());

/**
 * ROUTES
 */
app.use("/admin", adminRoutes);
app.use("/admin/auth", adminAuthRoutes);
app.use("/api", publicRoutes);
app.use("/", publicRoutes);

/**
 * HEALTH CHECK (important for Render)
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
