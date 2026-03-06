const { jsonResponse, normalizeError, requireAdmin } = require("./_admin-auth");

exports.handler = async function handler(event) {
  if (event?.httpMethod !== "GET") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const { supabaseUrl, serviceRoleKey } = await requireAdmin(event);

    const usersUrl = new URL("/auth/v1/admin/users", supabaseUrl);
    usersUrl.searchParams.set("page", "1");
    usersUrl.searchParams.set("per_page", "200");

    const usersResponse = await fetch(usersUrl, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!usersResponse.ok) {
      return jsonResponse(500, { ok: false, error: "users_fetch_failed" });
    }

    const payload = await usersResponse.json().catch(() => null);
    const users = Array.isArray(payload?.users) ? payload.users : [];
    const items = users
      .map((user) => ({
        id: typeof user?.id === "string" ? user.id : "",
        email: typeof user?.email === "string" ? user.email : "",
      }))
      .filter((user) => user.id && user.email)
      .sort((a, b) => a.email.localeCompare(b.email, "fr"));

    return jsonResponse(200, { ok: true, users: items });
  } catch (error) {
    const normalized = normalizeError(error);
    return jsonResponse(normalized.status, normalized.payload);
  }
};

