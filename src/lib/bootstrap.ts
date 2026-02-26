import { supabase } from "./supabase";

const DEFAULT_BOOKING_URL = "https://calendly.com/trustfinanceam/reserve-ton-appel-avec-matheo-aalberg-clone";

const DEFAULT_SESSIONS = [
  {
    theme: "Présentation de l’accompagnement & Bilan initial.",
    objective: "Clarifier le cadre, les attentes et analyser la situation actuelle du client.",
    booking_url: DEFAULT_BOOKING_URL,
  },
  {
    theme: "Optimisation et structuration bancaire.",
    objective: "Optimiser l’organisation financière et comprendre comment fonctionne réellement le système bancaire.",
    booking_url: DEFAULT_BOOKING_URL,
  },
  {
    theme: "Les bases fondamentales de l’investissement.",
    objective: "Comprendre pourquoi investir est indispensable et comment la richesse se crée réellement dans le temps.",
    booking_url: DEFAULT_BOOKING_URL,
  },
  {
    theme: "Structurer son investissement intelligemment.",
    objective: "Apprendre à construire une base solide : fiscalité, allocation d’actifs, diversification et cohérence avec son profil.",
    booking_url: DEFAULT_BOOKING_URL,
  },
  {
    theme: "Comprendre les marchés financiers et le système bancaire.",
    objective: "Comprendre où va réellement l’argent et pourquoi laisser dormir son capital est une erreur stratégique.",
    booking_url: DEFAULT_BOOKING_URL,
  },
];

const DEFAULT_TASKS = [
  { title: "Regarder la vidéo d'introduction", priority: "high", est_minutes: 30, status: "todo" },
  { title: "Regarder le Module 1 (leçons 1 à 3)", priority: "high", est_minutes: 10, status: "todo" },
  { title: "Réserver le 1er appel de coaching", priority: "high", est_minutes: 2, status: "todo" },
];

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
      .select("id,theme,objective,booking_url")
      .eq("user_id", userId)
      .eq("status", "planned");

    if (plannedSessionsErr) throw plannedSessionsErr;

    const objectiveByTheme = new Map(DEFAULT_SESSIONS.map((session) => [session.theme, session.objective]));

    const sessionsToRepair = (plannedSessions ?? []).filter((session) => {
      const bookingUrl = session.booking_url?.trim();
      return !bookingUrl || bookingUrl.includes("REMPLACE_PAR_TON_LIEN_CALENDLY");
    });

    for (const session of sessionsToRepair) {
      const fallbackObjective = session.theme ? objectiveByTheme.get(session.theme) : undefined;
      const isObjectiveEmpty = !session.objective || session.objective.trim().length === 0;

      const updatePayload: { booking_url: string; objective?: string } = {
        booking_url: DEFAULT_BOOKING_URL,
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
}
