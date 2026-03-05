const { createHmac, timingSafeEqual } = require("node:crypto");

const SESSION_TEMPLATES = [
  {
    theme: "Présentation de l’accompagnement & Bilan initial.",
    objective: "Clarifier le cadre, les attentes et analyser la situation actuelle du client.",
  },
  {
    theme: "Optimisation et structuration bancaire.",
    objective: "Optimiser l’organisation financière et comprendre comment fonctionne réellement le système bancaire.",
  },
  {
    theme: "Les bases fondamentales de l’investissement.",
    objective: "Comprendre pourquoi investir est indispensable et comment la richesse se crée réellement dans le temps.",
  },
  {
    theme: "Structurer son investissement intelligemment.",
    objective: "Apprendre à construire une base solide : fiscalité, allocation d’actifs, diversification et cohérence avec son profil.",
  },
  {
    theme: "Comprendre les marchés financiers et le système bancaire.",
    objective: "Comprendre où va réellement l’argent et pourquoi laisser dormir son capital est une erreur stratégique.",
  },
];

const BASE_URLS = {
  "Présentation de l’accompagnement & Bilan initial.": process.env.VITE_CALENDLY_SUBJECT_1_URL,
  "Optimisation et structuration bancaire.": process.env.VITE_CALENDLY_SUBJECT_2_URL,
  "Les bases fondamentales de l’investissement.": process.env.VITE_CALENDLY_SUBJECT_3_URL,
  "Structurer son investissement intelligemment.": process.env.VITE_CALENDLY_SUBJECT_4_URL,
  "Comprendre les marchés financiers et le système bancaire.":
    process.env.VITE_CALENDLY_SUBJECT_5_URL,
};
const FREE_BASE_URL = process.env.VITE_CALENDLY_FREE_URL;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SIGNATURE_AGE_SECONDS = 300;
const CANCEL_MATCH_WINDOW_MINUTES = 5;

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  };
}

function getHeader(headers, name) {
  if (!headers || typeof headers !== "object") {
    return "";
  }

  const targetName = name.toLowerCase();
  for (const [headerName, headerValue] of Object.entries(headers)) {
    if (headerName.toLowerCase() === targetName) {
      return Array.isArray(headerValue) ? String(headerValue[0] ?? "") : String(headerValue ?? "");
    }
  }

  return "";
}

function getRawBody(event) {
  const body = typeof event?.body === "string" ? event.body : "";
  if (event?.isBase64Encoded) {
    return Buffer.from(body, "base64").toString("utf8");
  }

  return body;
}

function parseSignatureHeader(signatureHeader) {
  const parts = String(signatureHeader)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  let timestamp = "";
  let signature = "";

  for (const part of parts) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();

    if (key === "t" && !timestamp) {
      timestamp = value;
    }

    if (key === "v1" && !signature) {
      signature = value;
    }
  }

  return { timestamp, signature };
}

function verifySignature(rawBody, signatureHeader, signingKey) {
  const { timestamp, signature } = parseSignatureHeader(signatureHeader);
  const timestampSeconds = Number.parseInt(timestamp, 10);

  if (!Number.isFinite(timestampSeconds) || !signature || !/^[0-9a-f]{64}$/i.test(signature)) {
    return false;
  }

  const currentTimestampSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTimestampSeconds - timestampSeconds) > MAX_SIGNATURE_AGE_SECONDS) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", signingKey).update(signedPayload).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(signature, "hex");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function isUuid(value) {
  return UUID_REGEX.test(String(value).trim());
}

function extractUserId(payload) {
  const answers = Array.isArray(payload?.questions_and_answers) ? payload.questions_and_answers : [];

  for (const item of answers) {
    const question = typeof item?.question === "string" ? item.question.trim() : "";
    if (question !== "TF_USER_ID") {
      continue;
    }

    const answer = typeof item?.answer === "string" ? item.answer.trim() : "";
    if (isUuid(answer)) {
      return answer;
    }
  }

  return null;
}

function getStartAt(payload) {
  const value =
    payload?.scheduled_event?.start_time ||
    payload?.event?.start_time ||
    payload?.scheduled_event?.start_time ||
    null;

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function getBaseBookingUrl(theme) {
  const source = theme ? BASE_URLS[theme] : FREE_BASE_URL;
  if (typeof source !== "string") {
    return null;
  }

  const normalized = source.trim();
  return normalized || null;
}

function resolveSessionTemplate(eventName) {
  const normalizedName = String(eventName ?? "").trim();

  if (!normalizedName) {
    return null;
  }

  if (normalizedName.toLowerCase().includes("sans sujet")) {
    return { theme: null, objective: null };
  }

  const subjectMatch = normalizedName.match(/sujet\s*(\d+)/i);
  if (!subjectMatch) {
    return null;
  }

  const subjectIndex = Number.parseInt(subjectMatch[1], 10);
  if (!Number.isInteger(subjectIndex) || subjectIndex < 1 || subjectIndex > SESSION_TEMPLATES.length) {
    return null;
  }

  return SESSION_TEMPLATES[subjectIndex - 1];
}

function buildSupabaseUrl(supabaseUrl, table, query) {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);

  if (query && typeof query === "object") {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function supabaseRequest({ supabaseUrl, serviceRoleKey, table, method = "GET", query, body, prefer }) {
  const url = buildSupabaseUrl(supabaseUrl, table, query);
  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
  };

  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  if (prefer) {
    headers.Prefer = prefer;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Erreur Supabase (${response.status}).`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

async function findSessionByScheduledAt(supabaseUrl, serviceRoleKey, userId, startAt) {
  const rows = await supabaseRequest({
    supabaseUrl,
    serviceRoleKey,
    table: "sessions",
    query: {
      select: "id,status",
      user_id: `eq.${userId}`,
      scheduled_at: `eq.${startAt}`,
      limit: "1",
    },
  });

  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function findPlannedSessionToSchedule(supabaseUrl, serviceRoleKey, userId, template) {
  const query = {
    select: "id",
    user_id: `eq.${userId}`,
    status: "eq.planned",
    scheduled_at: "is.null",
    order: "created_at.asc,id.asc",
    limit: "1",
  };

  if (template.theme) {
    query.theme = `eq.${template.theme}`;
  } else {
    query.theme = "is.null";
  }

  const rows = await supabaseRequest({
    supabaseUrl,
    serviceRoleKey,
    table: "sessions",
    query,
  });

  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function updateSessionById(supabaseUrl, serviceRoleKey, sessionId, payload) {
  await supabaseRequest({
    supabaseUrl,
    serviceRoleKey,
    table: "sessions",
    method: "PATCH",
    query: {
      id: `eq.${sessionId}`,
    },
    body: payload,
    prefer: "return=minimal",
  });
}

async function insertSession(supabaseUrl, serviceRoleKey, payload) {
  await supabaseRequest({
    supabaseUrl,
    serviceRoleKey,
    table: "sessions",
    method: "POST",
    body: payload,
    prefer: "return=minimal",
  });
}

async function patchCanceledSessionByUserAndStartAt({ supabaseUrl, serviceRoleKey, userId, startAt }) {
  const targetTime = new Date(startAt).getTime();
  if (Number.isNaN(targetTime)) {
    return null;
  }

  const minIso = new Date(targetTime - CANCEL_MATCH_WINDOW_MINUTES * 60 * 1000).toISOString();
  const maxIso = new Date(targetTime + CANCEL_MATCH_WINDOW_MINUTES * 60 * 1000).toISOString();

  const rows = await supabaseRequest({
    supabaseUrl,
    serviceRoleKey,
    table: "sessions",
    query: {
      select: "id,scheduled_at",
      user_id: `eq.${userId}`,
      status: "eq.planned",
      and: `(scheduled_at.gte.${minIso},scheduled_at.lte.${maxIso})`,
      order: "scheduled_at.asc",
      limit: "20",
    },
  });

  const matches = Array.isArray(rows) ? rows : [];
  if (matches.length === 0) {
    return null;
  }

  let bestMatch = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const session of matches) {
    const sessionTime = new Date(session?.scheduled_at ?? "").getTime();
    if (Number.isNaN(sessionTime)) {
      continue;
    }

    const delta = Math.abs(sessionTime - targetTime);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestMatch = session;
    }
  }

  if (!bestMatch?.id) {
    return null;
  }

  await supabaseRequest({
    supabaseUrl,
    serviceRoleKey,
    table: "sessions",
    method: "PATCH",
    query: {
      id: `eq.${bestMatch.id}`,
    },
    body: {
      scheduled_at: null,
    },
    prefer: "return=minimal",
  });

  return bestMatch.id;
}

async function handleInviteeCreated({ supabaseUrl, serviceRoleKey, userId, payload }) {
  const startAt = getStartAt(payload);
  if (!startAt) {
    console.warn("Webhook Calendly ignoré: start_time absent sur invitee.created.");
    return;
  }

  const existingScheduledSession = await findSessionByScheduledAt(supabaseUrl, serviceRoleKey, userId, startAt);
  if (existingScheduledSession) {
    return;
  }

  const template = resolveSessionTemplate(payload?.scheduled_event?.name);
  if (!template) {
    console.warn("Webhook Calendly ignoré: impossible de déduire le sujet.", payload?.scheduled_event?.name);
    return;
  }

  const rescheduleUrl =
    typeof payload?.reschedule_url === "string" && payload.reschedule_url.trim().length > 0
      ? payload.reschedule_url.trim()
      : null;

  const targetSession = await findPlannedSessionToSchedule(supabaseUrl, serviceRoleKey, userId, template);
  if (targetSession?.id) {
    const updatePayload = {
      scheduled_at: startAt,
    };

    if (rescheduleUrl) {
      updatePayload.booking_url = rescheduleUrl;
    }

    await updateSessionById(supabaseUrl, serviceRoleKey, targetSession.id, updatePayload);
    return;
  }

  await insertSession(supabaseUrl, serviceRoleKey, {
    user_id: userId,
    status: "planned",
    scheduled_at: startAt,
    theme: template.theme,
    objective: template.objective,
    booking_url: rescheduleUrl,
    summary: null,
    recording_url: null,
    transcript: null,
  });
}

exports.handler = async function handler(event) {
  if (event?.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  const signingKey = process.env.CALENDLY_SIGNING_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [];

  if (!signingKey) {
    missing.push("CALENDLY_SIGNING_KEY");
  }
  if (!supabaseUrl) {
    missing.push("SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length > 0) {
    console.error("Webhook Calendly non configuré: variables d'environnement manquantes.", missing);
    return jsonResponse(500, { ok: false, error: "missing_env", missing });
  }

  const rawBody = getRawBody(event);
  if (!rawBody.trim()) {
    return jsonResponse(400, { ok: false, error: "invalid_json" });
  }

  const signatureHeader = getHeader(event.headers, "calendly-webhook-signature");
  if (!signatureHeader) {
    return jsonResponse(401, { ok: false, error: "missing_signature" });
  }

  if (!verifySignature(rawBody, signatureHeader, signingKey)) {
    return jsonResponse(401, { ok: false, error: "invalid_signature" });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { ok: false, error: "invalid_json" });
  }

  const webhookEvent = body?.event;
  const webhookPayload = body?.payload;

  if (!webhookEvent || !webhookPayload) {
    return jsonResponse(200, { ok: true, ignored: true });
  }

  if (webhookEvent === "invitee.canceled") {
    const userId = extractUserId(webhookPayload);
    const startAt = getStartAt(webhookPayload);

    if (!userId || !startAt) {
      return jsonResponse(200, { ok: true, ignored: true });
    }

    let matchedSessionId = null;
    try {
      matchedSessionId = await patchCanceledSessionByUserAndStartAt({
        supabaseUrl,
        serviceRoleKey,
        userId,
        startAt,
      });
      console.log("invitee.canceled", { userId, startAt, matchedSessionId });

      if (!matchedSessionId) {
        console.log("no_session_match", { userId, startAt });
        return jsonResponse(200, { ok: true, ignored: true });
      }
    } catch (error) {
      console.error("Erreur webhook Calendly invitee.canceled.", error);
      return jsonResponse(200, { ok: true, ignored: true });
    }

    return jsonResponse(200, { ok: true, handled: "invitee.canceled" });
  }

  if (webhookEvent === "invitee.created") {
    const userId = extractUserId(webhookPayload);
    if (!userId) {
      console.warn("Webhook Calendly ignoré: TF_USER_ID absent ou invalide.");
      return jsonResponse(200, { ok: true, ignored: true });
    }

    try {
      await handleInviteeCreated({
        supabaseUrl,
        serviceRoleKey,
        userId,
        payload: webhookPayload,
      });
    } catch (error) {
      console.error("Erreur webhook Calendly invitee.created.", error);
      return jsonResponse(500, { ok: false, error: "internal_error" });
    }

    return jsonResponse(200, { ok: true, handled: "invitee.created" });
  }

  return jsonResponse(200, { ok: true, ignored: true });
};
