import { json, requireAdmin } from "./_admin-auth.js";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  const auth = await requireAdmin(event);
  if (!auth.ok) return json(auth.statusCode, { ok: false, error: auth.error });

  const { data, error } = await auth.supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) return json(500, { ok: false, error: "list_users_failed" });

  const users = (data?.users || [])
    .map((u) => ({ id: u.id, email: u.email }))
    .filter((u) => !!u.email)
    .sort((a, b) => a.email.localeCompare(b.email));

  return json(200, { ok: true, users });
};
