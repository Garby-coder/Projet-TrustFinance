const { createHttpError, jsonResponse, normalizeError, requireAdmin } = require("./_admin-auth");

function parseTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function sortSessions(a, b) {
  const timeA = parseTimestamp(a.scheduled_at);
  const timeB = parseTimestamp(b.scheduled_at);

  if (timeA !== null && timeB !== null && timeA !== timeB) {
    return timeA - timeB;
  }
  if (timeA === null && timeB !== null) {
    return 1;
  }
  if (timeA !== null && timeB === null) {
    return -1;
  }

  return a.id.localeCompare(b.id, "fr");
}

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
    sessionsUrl.searchParams.set("status", "eq.planned");
    sessionsUrl.searchParams.set("select", "id,theme,status,scheduled_at");

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
          .sort(sortSessions)
      : [];

    return jsonResponse(200, { ok: true, sessions });
  } catch (error) {
    const normalized = normalizeError(error);
    return jsonResponse(normalized.status, normalized.payload);
  }
};
