import { supabase } from "../supabase.js";

export async function logAudit(adminPhone, action, payload = {}) {
  await supabase.from("admin_audit_logs").insert({
    admin_phone: adminPhone,
    action,
    payload,
  });
}
