export function adminAuth(req, res, next) {
  const adminPhones = (process.env.ADMIN_PHONES || "")
    .split(",")
    .map((p) => p.trim());

  const phone = req.headers["x-admin-phone"];

  if (!phone || !adminPhones.includes(phone)) {
    return res.status(403).json({ error: "Admin access denied" });
  }
  console.log("phone",phone)

  next();
}
