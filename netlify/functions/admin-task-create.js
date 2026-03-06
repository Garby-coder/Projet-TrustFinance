const { createHttpError, jsonResponse, normalizeError, parseJsonBody, requireAdmin } = require("./_admin-auth");

exports.handler = async function handler(event) {
  if (event?.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const { supabaseUrl, serviceRoleKey } = await requireAdmin(event);
    const body = parseJsonBody(event);

    const targetUserId = typeof body?.target_user_id === "string" ? body.target_user_id.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const priority = typeof body?.priority === "string" && body.priority.trim() ? body.priority.trim() : "medium";
    const dueDate = typeof body?.due_date === "string" && body.due_date.trim() ? body.due_date.trim() : null;

    if (!targetUserId || !title) {
      throw createHttpError(400, { error: "missing_fields" });
    }

    const tasksUrl = new URL("/rest/v1/tasks", supabaseUrl);
    const insertResponse = await fetch(tasksUrl, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: targetUserId,
        title,
        priority,
        due_date: dueDate,
        status: "todo",
      }),
    });

    if (!insertResponse.ok) {
      return jsonResponse(500, { ok: false, error: "task_create_failed" });
    }

    return jsonResponse(200, { ok: true });
  } catch (error) {
    const normalized = normalizeError(error);
    return jsonResponse(normalized.status, normalized.payload);
  }
};

