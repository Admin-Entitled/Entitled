import express from "express";
import { supabase } from "../supabase.js";

router.get("/access", async (req, res) => {
    const { token } = req.query;
  
    const { data } = await supabase
      .from("access_sessions")
      .select("*")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .single();
  
    if (!data) return res.status(401).send("Invalid access");
  
    res.send(`
      <!DOCTYPE html>
      <html>
        <body>
          <form method="POST" action="https://${process.env.SHOPIFY_DOMAIN}/password">
            <input type="hidden" name="form_type" value="storefront_password" />
            <input type="hidden" name="utf8" value="✓" />
            <input type="password" name="password" value="${process.env.SHOPIFY_PASSWORD}" />
          </form>
          <script>document.forms[0].submit();</script>
        </body>
      </html>
    `);
  });
  
export default router;
