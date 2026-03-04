import { supabase } from "./supabase";

const SUBJECT_URLS = [
  import.meta.env.VITE_CALENDLY_SUBJECT_1_URL,
  import.meta.env.VITE_CALENDLY_SUBJECT_2_URL,
  import.meta.env.VITE_CALENDLY_SUBJECT_3_URL,
  import.meta.env.VITE_CALENDLY_SUBJECT_4_URL,
  import.meta.env.VITE_CALENDLY_SUBJECT_5_URL,
].map((value) => (value ?? "").trim());

const FREE_URL = (import.meta.env.VITE_CALENDLY_FREE_URL ?? "").trim();

const FALLBACK_URL = "https://calendly.com/trustfinanceam/reserve-ton-appel-avec-matheo-aalberg-clone";
const RESOLVED_FREE_URL = FREE_URL || FALLBACK_URL;

const DEFAULT_SESSIONS = [
  {
    theme: "Présentation de l’accompagnement & Bilan initial.",
    objective: "Clarifier le cadre, les attentes et analyser la situation actuelle du client.",
    booking_url: SUBJECT_URLS[0] || FALLBACK_URL,
  },
  {
    theme: "Optimisation et structuration bancaire.",
    objective: "Optimiser l’organisation financière et comprendre comment fonctionne réellement le système bancaire.",
    booking_url: SUBJECT_URLS[1] || FALLBACK_URL,
  },
  {
    theme: "Les bases fondamentales de l’investissement.",
    objective: "Comprendre pourquoi investir est indispensable et comment la richesse se crée réellement dans le temps.",
    booking_url: SUBJECT_URLS[2] || FALLBACK_URL,
  },
  {
    theme: "Structurer son investissement intelligemment.",
    objective: "Apprendre à construire une base solide : fiscalité, allocation d’actifs, diversification et cohérence avec son profil.",
    booking_url: SUBJECT_URLS[3] || FALLBACK_URL,
  },
  {
    theme: "Comprendre les marchés financiers et le système bancaire.",
    objective: "Comprendre où va réellement l’argent et pourquoi laisser dormir son capital est une erreur stratégique.",
    booking_url: SUBJECT_URLS[4] || FALLBACK_URL,
  },
];

const DEFAULT_TASKS = [
  { title: "Regarder la vidéo d'introduction", priority: "high", est_minutes: 30, status: "todo" },
  { title: "Regarder le Module 1 (leçons 1 à 3)", priority: "high", est_minutes: 10, status: "todo" },
  { title: "Réserver le 1er appel de coaching", priority: "high", est_minutes: 2, status: "todo" },
];

async function ensureUserEngagementRow(userId: string) {
  const { data, error } = await supabase.from("user_engagement").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;

  if (!data) {
    const { error: insertError } = await supabase.from("user_engagement").insert({
      user_id: userId,
      onboarding_done: false,
      cadence_unit: "week",
      cadence_target: 1,
      xp: 0,
      streak_current: 0,
      streak_best: 0,
      period_progress: 0,
      last_period_key: null,
    });

    if (insertError && insertError.code !== "23505") {
      throw insertError;
    }
  }
}

export async function ensureDefaultsForUser(userId: string) {
  // 1) Sessions : si aucune session pour cet utilisateur -> créer le pack
  const { count: sessionsCount, error: sessionsCountErr } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (sessionsCountErr) throw sessionsCountErr;

  if ((sessionsCount ?? 0) === 0) {
    const { error } = await supabase.from("sessions").insert(
      DEFAULT_SESSIONS.map((s) => ({
        user_id: userId,
        status: "planned",
        theme: s.theme,
        objective: s.objective,
        booking_url: s.booking_url,
        scheduled_at: null,
        summary: null,
        recording_url: null,
        transcript: null,
      }))
    );
    if (error) throw error;
  } else {
    const { data: plannedSessions, error: plannedSessionsErr } = await supabase
      .from("sessions")
      .select("id,theme,objective,booking_url,scheduled_at")
      .eq("user_id", userId)
      .eq("status", "planned");

    if (plannedSessionsErr) throw plannedSessionsErr;

    const objectiveByTheme = new Map(DEFAULT_SESSIONS.map((session) => [session.theme, session.objective]));
    const urlByTheme = new Map(DEFAULT_SESSIONS.map((session) => [session.theme, session.booking_url]));

    const sessionsToRepair = (plannedSessions ?? []).filter((session) => {
      const bookingUrl = session.booking_url?.trim() ?? "";
      return (
        session.scheduled_at === null &&
        (!bookingUrl || bookingUrl === FALLBACK_URL || bookingUrl.includes("REMPLACE_PAR_TON_LIEN_CALENDLY"))
      );
    });

    for (const session of sessionsToRepair) {
      const fallbackObjective = session.theme ? objectiveByTheme.get(session.theme) : undefined;
      const isObjectiveEmpty = !session.objective || session.objective.trim().length === 0;
      const resolvedBookingUrl = session.theme ? urlByTheme.get(session.theme) ?? FALLBACK_URL : RESOLVED_FREE_URL;

      const updatePayload: { booking_url: string; objective?: string } = {
        booking_url: resolvedBookingUrl,
      };

      if (isObjectiveEmpty && fallbackObjective) {
        updatePayload.objective = fallbackObjective;
      }

      const { error } = await supabase.from("sessions").update(updatePayload).eq("id", session.id).eq("user_id", userId);
      if (error) throw error;
    }
  }

  // 2) Tasks : si aucune tâche -> créer le pack
  const { count: tasksCount, error: tasksCountErr } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (tasksCountErr) throw tasksCountErr;

  if ((tasksCount ?? 0) === 0) {
    const { error } = await supabase.from("tasks").insert(
      DEFAULT_TASKS.map((t) => ({
        user_id: userId,
        ...t,
      }))
    );
    if (error) throw error;
  }

  // 3) Engagement utilisateur : créer la ligne si elle n'existe pas
  await ensureUserEngagementRow(userId);
}
