import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

import adminRoutes from "./routes/admin.js";
import adminAuthRoutes from "./routes/adminAuth.js";
import publicRoutes from "./routes/public.js";

const app = express();

/**
 * CORS — SINGLE SOURCE OF TRUTH
 */
app.use(
  cors({
    origin: [
      "https://entitled-admin-ui.onrender.com",
      "https://auth.entitledclub.com",
      "https://entitledclub.com",
      "http://localhost:5173",
    ],
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
