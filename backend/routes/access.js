import express from "express";
import { supabase } from "../supabase.js";

const router = express.Router();

router.get("/access", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send("Access token missing");
  }

  const { data: session } = await supabase
    .from("access_sessions")
    .select("*")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!session) {
    return res.status(401).send("Access expired or invalid");
  }

  // VALID SESSION → AUTO ENTER SHOPIFY
  res.send(`
    <!DOCTYPE html>
    <html>
      <body>
        <form method="POST" action="https://${process.env.SHOPIFY_DOMAIN}/password">
          <input type="hidden" name="form_type" value="storefront_password" />
          <input type="hidden" name="utf8" value="✓" />
          <input type="password" name="password" value="${process.env.SHOPIFY_PASSWORD}" />
        </form>
        <script>
          document.forms[0].submit();
        </script>
      </body>
    </html>
    `);
    
});

export default router;
