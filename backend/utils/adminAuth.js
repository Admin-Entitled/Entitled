import { supabase } from "../supabase.js";

export async function adminSessionAuth(req, res, next) {
  const token = req.cookies.admin_session;

  if (!token) {
    return res.status(401).json({ error: "Admin not logged in" });
  }

  const { data, error } = await supabase
    .from("admin_sessions")
    .select("admin_phone")
    .eq("token", token)
    .single();

  if (error || !data) {
    return res.status(401).json({ error: "Invalid admin session" });
  }

  req.adminPhone = data.admin_phone;
  next();
}
