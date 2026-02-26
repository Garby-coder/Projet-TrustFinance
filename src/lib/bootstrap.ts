import { supabase } from "./supabase";

const DEFAULT_SESSIONS = [
  {
    theme: "Présentation de l’accompagnement & Bilan initial.",
    objective: "Clarifier le cadre, les attentes et analyser la situation actuelle du client.",
    booking_url: "https://calendly.com/trustfinanceam/reserve-ton-appel-avec-matheo-aalberg-clone",
  },
  {
    theme: "Optimisation et structuration bancaire.",
    objective: "Optimiser l’organisation financière et comprendre comment fonctionne réellement le système bancaire.",
    booking_url: "https://calendly.com/trustfinanceam/reserve-ton-appel-avec-matheo-aalberg-clone",
  },
  {
    theme: "Les bases fondamentales de l’investissement.",
    objective: "Comprendre pourquoi investir est indispensable et comment la richesse se crée réellement dans le temps.",
    booking_url: "https://calendly.com/trustfinanceam/reserve-ton-appel-avec-matheo-aalberg-clone",
  },
  {
    theme: "Structurer son investissement intelligemment.",
    objective: "Apprendre à construire une base solide : fiscalité, allocation d’actifs, diversification et cohérence avec son profil.",
    booking_url: "https://calendly.com/trustfinanceam/reserve-ton-appel-avec-matheo-aalberg-clone",
  },
  {
    theme: "Comprendre les marchés financiers et le système bancaire.",
    objective: "Comprendre où va réellement l’argent et pourquoi laisser dormir son capital est une erreur stratégique.",
    booking_url: "https://calendly.com/trustfinanceam/reserve-ton-appel-avec-matheo-aalberg-clone",
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