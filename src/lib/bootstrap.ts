import { supabase } from "./supabase";

const DEFAULT_SESSIONS = [
  {
    theme: "Onboarding & objectifs",
    objective: "Clarifier profil, contraintes, objectifs et prochaines étapes.",
    booking_url: "REMPLACE_PAR_TON_LIEN_CALENDLY_1",
  },
  {
    theme: "Construction du portefeuille",
    objective: "Définir allocation, enveloppes, et portefeuille cible.",
    booking_url: "REMPLACE_PAR_TON_LIEN_CALENDLY_2",
  },
  {
    theme: "Automatisation (DCA + règles)",
    objective: "Mettre en place un système simple et automatique.",
    booking_url: "REMPLACE_PAR_TON_LIEN_CALENDLY_3",
  },
  {
    theme: "Optimisation (frais, diversification, erreurs)",
    objective: "Sécuriser le plan et éviter les pièges classiques.",
    booking_url: "REMPLACE_PAR_TON_LIEN_CALENDLY_4",
  },
  {
    theme: "Revue & ajustements",
    objective: "Bilan, ajustements et plan d’action suivant.",
    booking_url: "REMPLACE_PAR_TON_LIEN_CALENDLY_5",
  },
];

const DEFAULT_TASKS = [
  { title: "Regarder le Module 1 (leçons 1 à 3)", priority: "high", est_minutes: 30, status: "todo" },
  { title: "Remplir les infos de départ (profil / objectifs)", priority: "high", est_minutes: 10, status: "todo" },
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