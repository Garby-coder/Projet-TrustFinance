const { createHttpError, jsonResponse, normalizeError, parseJsonBody, requireAdmin } = require("./_admin-auth");

exports.handler = async function handler(event) {
  if (event?.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const { supabaseUrl, serviceRoleKey } = await requireAdmin(event);
    const body = parseJsonBody(event);

    const targetUserId = typeof body?.target_user_id === "string" ? body.target_user_id.trim() : "";
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    const recordingUrl =
      typeof body?.recording_url === "string" && body.recording_url.trim() ? body.recording_url.trim() : null;
    const summary = typeof body?.summary === "string" && body.summary.trim() ? body.summary.trim() : null;
    const transcript = typeof body?.transcript === "string" && body.transcript.trim() ? body.transcript.trim() : null;

    if (!targetUserId || !sessionId) {
      throw createHttpError(400, { error: "missing_fields" });
    }

    const sessionUrl = new URL("/rest/v1/sessions", supabaseUrl);
    sessionUrl.searchParams.set("id", `eq.${sessionId}`);
    sessionUrl.searchParams.set("user_id", `eq.${targetUserId}`);
    sessionUrl.searchParams.set("select", "id");

    const updateResponse = await fetch(sessionUrl, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        status: "completed",
        recording_url: recordingUrl,
        summary,
        transcript,
      }),
    });

    if (!updateResponse.ok) {
      return jsonResponse(500, { ok: false, error: "session_update_failed" });
    }

    const rows = await updateResponse.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) {
      return jsonResponse(404, { ok: false, error: "session_not_found" });
    }

    return jsonResponse(200, { ok: true });
  } catch (error) {
    const normalized = normalizeError(error);
    return jsonResponse(normalized.status, normalized.payload);
  }
};

