const { createHttpError, jsonResponse, normalizeError, requireAdmin } = require("./_admin-auth");

exports.handler = async function handler(event) {
  if (event?.httpMethod !== "GET") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const { supabaseUrl, serviceRoleKey } = await requireAdmin(event);
    const targetUserId =
      typeof event?.queryStringParameters?.user_id === "string"
        ? event.queryStringParameters.user_id.trim()
        : "";

    if (!targetUserId) {
      throw createHttpError(400, { error: "missing_user_id" });
    }

    const sessionsUrl = new URL("/rest/v1/sessions", supabaseUrl);
    sessionsUrl.searchParams.set("user_id", `eq.${targetUserId}`);
    sessionsUrl.searchParams.set("select", "id,theme,status,scheduled_at");
    sessionsUrl.searchParams.set("order", "scheduled_at.desc.nullslast");

    const sessionsResponse = await fetch(sessionsUrl, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!sessionsResponse.ok) {
      return jsonResponse(500, { ok: false, error: "sessions_fetch_failed" });
    }

    const rows = await sessionsResponse.json().catch(() => []);
    const sessions = Array.isArray(rows)
      ? rows
          .map((row) => ({
            id: typeof row?.id === "string" ? row.id : "",
            theme: typeof row?.theme === "string" ? row.theme : null,
            status: typeof row?.status === "string" ? row.status : null,
            scheduled_at: typeof row?.scheduled_at === "string" ? row.scheduled_at : null,
          }))
          .filter((session) => session.id)
      : [];

    return jsonResponse(200, sessions);
  } catch (error) {
    const normalized = normalizeError(error);
    return jsonResponse(normalized.status, normalized.payload);
  }
};
