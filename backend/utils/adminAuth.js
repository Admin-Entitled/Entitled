import { supabase } from "../supabase.js";

export async function adminSessionAuth(req, res, next) {
  const token = req.cookies?.admin_session;
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { data } = await supabase
    .from("admin_sessions")
    .select("*")
    .eq("token", token)
    .single();

  if (!data) {
    return res.status(401).json({ error: "Invalid session" });
  }

  req.adminPhone = data.admin_phone;
  next();
}
