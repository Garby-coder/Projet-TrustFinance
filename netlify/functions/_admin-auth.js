function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  };
}

function getHeader(event, name) {
  const headers = event?.headers;
  if (!headers || typeof headers !== "object") {
    return "";
  }

  const target = name.toLowerCase();
  for (const [headerName, headerValue] of Object.entries(headers)) {
    if (headerName.toLowerCase() === target) {
      return Array.isArray(headerValue) ? String(headerValue[0] ?? "") : String(headerValue ?? "");
    }
  }

  return "";
}

function createHttpError(status, payload) {
  const error = new Error(payload?.error || "http_error");
  error.status = status;
  error.payload = {
    ok: false,
    ...(payload ?? {}),
  };
  return error;
}

function normalizeError(error) {
  if (error && typeof error === "object") {
    const err = error;
    if (typeof err.status === "number" && err.payload && typeof err.payload === "object") {
      return {
        status: err.status,
        payload: err.payload,
      };
    }
  }

  return {
    status: 500,
    payload: {
      ok: false,
      error: "internal_error",
    },
  };
}

function getRawBody(event) {
  const body = typeof event?.body === "string" ? event.body : "";
  if (event?.isBase64Encoded) {
    return Buffer.from(body, "base64").toString("utf8");
  }

  return body;
}

function parseJsonBody(event) {
  const raw = getRawBody(event);
  if (!raw.trim()) {
    throw createHttpError(400, { error: "invalid_json" });
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw createHttpError(400, { error: "invalid_json" });
  }
}

function getEnvOrThrow() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [];

  if (!supabaseUrl) {
    missing.push("SUPABASE_URL");
  }

  if (!serviceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length > 0) {
    throw createHttpError(500, { error: "missing_env", missing });
  }

  return { supabaseUrl, serviceRoleKey };
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requireAdmin(event) {
  const { supabaseUrl, serviceRoleKey } = getEnvOrThrow();

  const authorization = getHeader(event, "authorization");
  const bearerPrefix = "bearer ";

  if (!authorization || authorization.toLowerCase().startsWith(bearerPrefix) === false) {
    throw createHttpError(401, { error: "missing_bearer" });
  }

  const accessToken = authorization.slice(bearerPrefix.length).trim();
  if (!accessToken) {
    throw createHttpError(401, { error: "missing_bearer" });
  }

  const userResponse = await fetch(new URL("/auth/v1/user", supabaseUrl), {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!userResponse.ok) {
    throw createHttpError(401, { error: "invalid_token" });
  }

  const userData = await safeJson(userResponse);
  const userId = typeof userData?.id === "string" ? userData.id : "";

  if (!userId) {
    throw createHttpError(401, { error: "invalid_token" });
  }

  const profileUrl = new URL("/rest/v1/profiles", supabaseUrl);
  profileUrl.searchParams.set("id", `eq.${userId}`);
  profileUrl.searchParams.set("select", "is_admin");
  profileUrl.searchParams.set("limit", "1");

  const profileResponse = await fetch(profileUrl, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!profileResponse.ok) {
    throw createHttpError(500, { error: "admin_check_failed" });
  }

  const profileRows = await safeJson(profileResponse);
  const isAdmin = Array.isArray(profileRows) && profileRows[0]?.is_admin === true;
  if (!isAdmin) {
    throw createHttpError(403, { error: "forbidden" });
  }

  return { userId, supabaseUrl, serviceRoleKey };
}

module.exports = {
  createHttpError,
  jsonResponse,
  normalizeError,
  parseJsonBody,
  requireAdmin,
};

