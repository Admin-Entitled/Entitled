import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

// Resolve correct .env path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

if (!process.env.SUPABASE_URL) {
  console.error("❌ SUPABASE_URL is missing");
  process.exit(1);
}

console.log("✅ SUPABASE_URL loaded");

// IMPORT AFTER dotenv
const { supabase } = await import("../supabase.js");

const phone = process.env.ADMIN_PHONE;
const password = process.env.ADMIN_PASSWORD;

async function run() {
  if (!phone || !password) {
    console.error("❌ ADMIN_PHONE and ADMIN_PASSWORD are required");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  const { error } = await supabase.from("admin_users").insert({
    phone,
    password_hash: hash,
    is_active: true,
  });

  if (error) {
    console.error("❌ Error creating admin:", error.message);
  } else {
    console.log("✅ Admin created successfully");
  }
}

run();
