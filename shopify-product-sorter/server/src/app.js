import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import apiRouter from "./routes/api.js";
import deliveryRouter from "./routes/deliveryResolution.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, "../../client/dist");

app.use(
  cors({
    origin: env.clientOrigin,
  }),
);
app.use(express.json({ limit: "30mb" }));
app.use("/api", apiRouter);
app.use("/api/delivery-resolution", deliveryRouter);

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

export default app;
