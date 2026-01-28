import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import accessRoutes from "./routes/access.js";
import adminRoutes from "./routes/admin.js";
import cookieParser from "cookie-parser";
import adminAuthRoutes from "./routes/adminAuth.js";
import cors from "cors";

dotenv.config();

const app = express();
const allowedOrigins = [
  "https://entitled-admin-ui.onrender.com",
  "https://auth.entitledclub.com",
  "http://localhost:5173",
];

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use("/api", authRoutes);
app.use("/admin", adminRoutes);
app.use("/", accessRoutes);
app.use("/admin", adminAuthRoutes);
app.use(
  cors({
    origin: function (origin, callback) {
      // allow server-to-server or curl (no origin)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS not allowed"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// IMPORTANT: preflight
app.options("*", cors());

app.get("/health", (req, res) => {
  res.send("Backend running");
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

app.listen(4000, () => {
  console.log("Backend running on http://localhost:4000");
});
