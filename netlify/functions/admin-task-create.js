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
  const title = (body.title || "").trim();
  const priority = body.priority || "Moyenne";
  const due_date = body.due_date || null;

  if (!target_user_id) return json(400, { ok: false, error: "missing_target_user_id" });
  if (!title) return json(400, { ok: false, error: "missing_title" });

  const insertPayload = {
    user_id: target_user_id,
    title,
    priority,
    due_date,
    status: "todo",
  };

  const { data, error } = await auth.supabaseAdmin
    .from("tasks")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) return json(500, { ok: false, error: "task_insert_failed" });

  return json(200, { ok: true, task_id: data?.id });
};
