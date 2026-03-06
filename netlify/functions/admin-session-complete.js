import { json, requireAdmin } from "./_admin-auth.js";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const auth = await requireAdmin(event);
  if (!auth.ok) return json(auth.statusCode, { ok: false, error: auth.error });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const target_user_id = body.target_user_id;
  const session_id = body.session_id;
  const recording_url = (body.recording_url || "").trim();
  const summary = (body.summary || "").trim();
  const transcript = body.transcript || null;

  if (!target_user_id) return json(400, { ok: false, error: "missing_target_user_id" });
  if (!session_id) return json(400, { ok: false, error: "missing_session_id" });
  if (!recording_url) return json(400, { ok: false, error: "missing_recording_url" });
  if (!summary) return json(400, { ok: false, error: "missing_summary" });

  const updatePayload = {
    status: "completed",
    recording_url,
    summary,
  };

  if (typeof transcript === "string" && transcript.trim().length > 0) {
    updatePayload.transcript = transcript.trim();
  }

  const { data, error } = await auth.supabaseAdmin
    .from("sessions")
    .update(updatePayload)
    .eq("id", session_id)
    .eq("user_id", target_user_id)
    .select("id,status")
    .single();

  if (error) return json(500, { ok: false, error: "session_update_failed" });

  return json(200, { ok: true, session: data });
};
