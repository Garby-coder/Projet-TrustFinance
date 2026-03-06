import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function getBearerToken(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length).trim();
}

export async function requireAdmin(event) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, statusCode: 500, error: "missing_env" };
  }

  const token = getBearerToken(event);
  if (!token) return { ok: false, statusCode: 401, error: "missing_token" };

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return { ok: false, statusCode: 401, error: "invalid_token" };

  const { data: prof, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profErr || !prof?.is_admin) return { ok: false, statusCode: 403, error: "forbidden" };

  return { ok: true, userId: user.id, supabaseAdmin };
}
