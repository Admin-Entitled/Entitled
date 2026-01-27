import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import accessRoutes from "./routes/access.js";
import adminRoutes from "./routes/admin.js";


dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", authRoutes);
app.use("/admin", adminRoutes);
app.use("/", accessRoutes);



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
