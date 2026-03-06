import { json, requireAdmin } from "./_admin-auth.js";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  const auth = await requireAdmin(event);
  if (!auth.ok) return json(auth.statusCode, { ok: false, error: auth.error });

  const userId = event.queryStringParameters?.user_id;
  if (!userId) return json(400, { ok: false, error: "missing_user_id" });

  const { data, error } = await auth.supabaseAdmin
    .from("sessions")
    .select("id, theme, status, scheduled_at")
    .eq("user_id", userId)
    .order("scheduled_at", { ascending: false, nullsFirst: false });

  if (error) return json(500, { ok: false, error: "sessions_fetch_failed" });

  return json(200, { ok: true, sessions: data ?? [] });
};
