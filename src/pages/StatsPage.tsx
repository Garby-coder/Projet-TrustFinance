import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Stats = {
  totalLessons: number;
  totalSessions: number;
  tasksTodoDoing: number;
  tasksDone: number;
};

type ModuleRow = {
  id: string;
  title: string;
  order_index: number;
};

type LessonRow = {
  id: string;
  module_id: string | null;
  title: string;
  order_index: number;
};

type SessionRow = {
  id: string;
  status: string | null;
  order_index: number | null;
  created_at: string | null;
  theme: string | null;
  booking_url: string | null;
  scheduled_at: string | null;
};

type FormationAction = {
  moduleId: string;
  moduleTitle: string;
  lessonId: string;
  lessonTitle: string;
};

type QuizAction = {
  moduleId: string;
  moduleTitle: string;
};

type CoachingAction = {
  sessionId: string;
  sessionTitle: string;
  bookingUrl: string;
  isReplanification: boolean;
};

function parseDate(dateValue: string | null) {
  if (!dateValue) {
    return null;
  }

  const timestamp = Date.parse(dateValue);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return timestamp;
}

function isMissingTableError(error: { code?: string; message: string }, tableName: string) {
  const message = error.message.toLowerCase();
  return error.code === "42P01" || (message.includes("does not exist") && message.includes(tableName));
}

function isOrderIndexMissingColumnError(errorMessage: string) {
  const normalizedMessage = errorMessage.toLowerCase();
  return normalizedMessage.includes("order_index") && (normalizedMessage.includes("column") || normalizedMessage.includes("does not exist"));
}

function isValidHttpUrl(urlValue: string | null) {
  if (!urlValue) {
    return false;
  }

  try {
    const parsed = new URL(urlValue);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchTableCount(table: "lessons" | "sessions") {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) {
    throw error;
  }
  return count ?? 0;
}

async function fetchTaskSplit() {
  const statusResult = await supabase.from("tasks").select("status");
  if (!statusResult.error) {
    const rows = (statusResult.data ?? []) as Array<{ status: string | null }>;
    const done = rows.filter((row) => row.status?.toLowerCase() === "done").length;
    return { todoDoing: rows.length - done, done };
  }

  const booleanColumns = ["is_done", "done", "completed"] as const;

  for (const column of booleanColumns) {
    const boolResult = await supabase.from("tasks").select(column);
    if (!boolResult.error) {
      const rows = (boolResult.data ?? []) as Array<Record<string, boolean | null>>;
      const done = rows.filter((row) => row[column] === true).length;
      return { todoDoing: rows.length - done, done };
    }
  }

  throw statusResult.error;
}

export default function StatsPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalLessons: 0,
    totalSessions: 0,
    tasksTodoDoing: 0,
    tasksDone: 0,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [actionsError, setActionsError] = useState("");
  const [formationAction, setFormationAction] = useState<FormationAction | null>(null);
  const [formationReason, setFormationReason] = useState("Chargement de la formation...");
  const [quizAction, setQuizAction] = useState<QuizAction | null>(null);
  const [quizReason, setQuizReason] = useState("Chargement du quiz...");
  const [coachingAction, setCoachingAction] = useState<CoachingAction | null>(null);
  const [coachingReason, setCoachingReason] = useState("Chargement des coachings...");

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const [totalLessons, totalSessions, taskSplit] = await Promise.all([
          fetchTableCount("lessons"),
          fetchTableCount("sessions"),
          fetchTaskSplit(),
        ]);

        if (!isMounted) {
          return;
        }

        setStats({
          totalLessons,
          totalSessions,
          tasksTodoDoing: taskSplit.todoDoing,
          tasksDone: taskSplit.done,
        });
      } catch (err) {
        if (!isMounted) {
          return;
        }

        setError(err instanceof Error ? err.message : "Erreur lors du chargement des statistiques.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      setActionsLoading(true);
      setActionsError("");

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        const userId = userError ? null : (userData.user?.id ?? null);

        if (!isMounted) {
          return;
        }

        if (!userId) {
          setFormationAction(null);
          setFormationReason("Utilisateur introuvable.");
          setQuizAction(null);
          setQuizReason("Utilisateur introuvable.");
          setCoachingAction(null);
          setCoachingReason("Utilisateur introuvable.");
          setActionsLoading(false);
          return;
        }

        const [modulesResult, lessonsResult, lessonProgressResult, quizProgressResult, sessionsPrimaryResult] = await Promise.all([
          supabase.from("modules").select("id,title,order_index,is_published").eq("is_published", true).order("order_index", { ascending: true }),
          supabase.from("lessons").select("id,module_id,title,order_index,is_published").eq("is_published", true).order("order_index", { ascending: true }),
          supabase.from("lesson_progress").select("lesson_id").eq("user_id", userId).eq("status", "done"),
          supabase.from("module_quiz_progress").select("module_id,passed").eq("user_id", userId),
          supabase
            .from("sessions")
            .select("id,status,order_index,created_at,theme,booking_url,scheduled_at")
            .eq("user_id", userId)
            .order("scheduled_at", { ascending: true }),
        ]);

        if (!isMounted) {
          return;
        }

        let sessionsData = sessionsPrimaryResult.data as SessionRow[] | null;
        let sessionsError = sessionsPrimaryResult.error;
        if (sessionsError && isOrderIndexMissingColumnError(sessionsError.message)) {
          const sessionsFallbackResult = await supabase
            .from("sessions")
            .select("id,status,created_at,theme,booking_url,scheduled_at")
            .eq("user_id", userId)
            .order("scheduled_at", { ascending: true });

          if (!isMounted) {
            return;
          }

          sessionsData = (sessionsFallbackResult.data ?? []).map((session) => ({ ...session, order_index: null })) as SessionRow[];
          sessionsError = sessionsFallbackResult.error;
        }

        const modulesError = modulesResult.error;
        const lessonsError = lessonsResult.error;
        const lessonProgressError = lessonProgressResult.error;
        const quizProgressError = quizProgressResult.error;

        let modules: ModuleRow[] = [];
        let lessons: LessonRow[] = [];
        let completedLessonIds = new Set<string>();
        let passedByModuleId: Record<string, boolean> = {};
        let quizRequiredByModuleId: Record<string, boolean> = {};

        if (modulesError || lessonsError) {
          setFormationAction(null);
          setFormationReason("Formation indisponible pour le moment.");
          setQuizAction(null);
          setQuizReason("Quiz indisponible pour le moment.");
        } else {
          modules = (modulesResult.data ?? []) as ModuleRow[];
          lessons = (lessonsResult.data ?? []) as LessonRow[];

          if (lessonProgressError) {
            if (isMissingTableError(lessonProgressError, "lesson_progress")) {
              setFormationAction(null);
              setFormationReason("Progression des leçons indisponible pour le moment.");
            } else {
              setFormationAction(null);
              setFormationReason("Impossible de lire la progression des leçons.");
              setActionsError(`Détail: ${lessonProgressError.message}`);
            }
          } else {
            completedLessonIds = new Set(
              ((lessonProgressResult.data ?? []) as Array<{ lesson_id: string | null }>)
                .map((row) => row.lesson_id)
                .filter((lessonId): lessonId is string => Boolean(lessonId))
            );
          }

          if (quizProgressError) {
            if (isMissingTableError(quizProgressError, "module_quiz_progress")) {
              setQuizAction(null);
              setQuizReason("Progression des quiz indisponible pour le moment.");
            } else {
              setQuizAction(null);
              setQuizReason("Impossible de lire la progression des quiz.");
              setActionsError((current) => current || `Détail: ${quizProgressError.message}`);
            }
          } else {
            for (const row of (quizProgressResult.data ?? []) as Array<{ module_id: string | null; passed: boolean | null }>) {
              if (row.module_id && row.passed === true) {
                passedByModuleId[row.module_id] = true;
              }
            }
          }

          if (modules.length > 0) {
            const moduleIds = modules.map((module) => module.id);
            const moduleQuizResult = await supabase.from("module_quizzes").select("module_id,is_published").in("module_id", moduleIds);

            if (!isMounted) {
              return;
            }

            if (moduleQuizResult.error) {
              if (!isMissingTableError(moduleQuizResult.error, "module_quizzes")) {
                setQuizReason("Impossible de charger les quiz des modules.");
                setActionsError((current) => current || `Détail: ${moduleQuizResult.error.message}`);
              } else {
                setQuizReason("Aucun quiz disponible pour le moment.");
              }
            } else {
              for (const row of (moduleQuizResult.data ?? []) as Array<{ module_id: string | null; is_published: boolean | null }>) {
                if (row.module_id && row.is_published === true) {
                  quizRequiredByModuleId[row.module_id] = true;
                }
              }
            }
          }

          const modulesSorted = [...modules].sort((a, b) => a.order_index - b.order_index);
          const unlockedByModuleId: Record<string, boolean> = {};

          for (let index = 0; index < modulesSorted.length; index += 1) {
            const currentModule = modulesSorted[index];

            if (index === 0) {
              unlockedByModuleId[currentModule.id] = true;
              continue;
            }

            const previousModule = modulesSorted[index - 1];
            const quizRequiredForPrevious = quizRequiredByModuleId[previousModule.id] === true;
            const quizPassedForPrevious = !quizRequiredForPrevious || passedByModuleId[previousModule.id] === true;
            unlockedByModuleId[currentModule.id] = quizPassedForPrevious;
          }

          if (!lessonProgressError) {
            let nextFormation: FormationAction | null = null;

            for (const module of modulesSorted) {
              if (unlockedByModuleId[module.id] !== true) {
                continue;
              }

              const moduleLessons = lessons
                .filter((lesson) => lesson.module_id === module.id)
                .sort((a, b) => a.order_index - b.order_index);

              const nextLesson = moduleLessons.find((lesson) => !completedLessonIds.has(lesson.id));
              if (nextLesson) {
                nextFormation = {
                  moduleId: module.id,
                  moduleTitle: module.title,
                  lessonId: nextLesson.id,
                  lessonTitle: nextLesson.title,
                };
                break;
              }
            }

            if (nextFormation) {
              setFormationAction(nextFormation);
              setFormationReason(`Leçon suivante : ${nextFormation.lessonTitle} (Module ${nextFormation.moduleTitle}).`);
            } else {
              setFormationAction(null);
              setFormationReason("Aucune leçon à reprendre pour le moment.");
            }
          }

          if (!quizProgressError) {
            let nextQuiz: QuizAction | null = null;

            for (const module of modulesSorted) {
              if (unlockedByModuleId[module.id] !== true) {
                continue;
              }

              const moduleHasQuiz = quizRequiredByModuleId[module.id] === true;
              const moduleQuizPassed = passedByModuleId[module.id] === true;
              if (moduleHasQuiz && !moduleQuizPassed) {
                nextQuiz = {
                  moduleId: module.id,
                  moduleTitle: module.title,
                };
                break;
              }
            }

            if (nextQuiz) {
              setQuizAction(nextQuiz);
              setQuizReason(`Quiz à valider : Module ${nextQuiz.moduleTitle}.`);
            } else if (modules.length > 0) {
              setQuizAction(null);
              setQuizReason("Aucun quiz à valider pour le moment.");
            } else {
              setQuizAction(null);
              setQuizReason("Aucun module disponible.");
            }
          }
        }

        if (sessionsError) {
          if (isMissingTableError(sessionsError, "sessions")) {
            setCoachingAction(null);
            setCoachingReason("Aucun coaching prévu.");
          } else {
            setCoachingAction(null);
            setCoachingReason("Impossible de charger les séances.");
            setActionsError((current) => current || `Détail: ${sessionsError.message}`);
          }
        } else {
          const sessions = (sessionsData ?? []) as SessionRow[];
          const nextSession = [...sessions]
            .filter((session) => session.status?.toLowerCase() !== "completed")
            .sort((a, b) => {
              const orderA = a.order_index ?? Number.POSITIVE_INFINITY;
              const orderB = b.order_index ?? Number.POSITIVE_INFINITY;
              if (orderA !== orderB) {
                return orderA - orderB;
              }

              const createdA = parseDate(a.created_at);
              const createdB = parseDate(b.created_at);
              if (createdA !== null && createdB !== null && createdA !== createdB) {
                return createdA - createdB;
              }
              if (createdA === null && createdB !== null) {
                return 1;
              }
              if (createdA !== null && createdB === null) {
                return -1;
              }

              return a.id.localeCompare(b.id, "fr");
            })[0];

          if (!nextSession) {
            setCoachingAction(null);
            setCoachingReason("Aucun coaching prévu.");
          } else if (isValidHttpUrl(nextSession.booking_url)) {
            const isReplanification = parseDate(nextSession.scheduled_at) !== null;
            setCoachingAction({
              sessionId: nextSession.id,
              sessionTitle: nextSession.theme ?? "Séance sans thème",
              bookingUrl: nextSession.booking_url ?? "",
              isReplanification,
            });
            setCoachingReason(
              `${isReplanification ? "Séance à replanifier" : "Séance à réserver"} : ${nextSession.theme ?? "Séance sans thème"}.`
            );
          } else {
            setCoachingAction(null);
            setCoachingReason("Lien de réservation indisponible pour la prochaine séance.");
          }
        }
      } catch (err) {
        if (!isMounted) {
          return;
        }

        setFormationAction(null);
        setQuizAction(null);
        setCoachingAction(null);
        setFormationReason("Formation indisponible pour le moment.");
        setQuizReason("Quiz indisponible pour le moment.");
        setCoachingReason("Coaching indisponible pour le moment.");
        setActionsError(err instanceof Error ? err.message : "Impossible de charger les actions.");
      } finally {
        if (isMounted) {
          setActionsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleFormationAction() {
    if (!formationAction) {
      return;
    }

    navigate("/formation");
  }

  function handleQuizAction() {
    if (!quizAction) {
      return;
    }

    navigate("/formation");
  }

  return (
    <section>
      <h2 className="section-title">Statistiques</h2>
      <p className="section-subtitle">Vue rapide de votre contenu et de vos tâches.</p>

      {error && <div className="error-box">Erreur Supabase: {error}</div>}
      {loading && <p className="muted">Chargement...</p>}

      {!loading && (
        <div className="stats-grid">
          <article className="stat-card">
            <p className="stat-label">Total lessons</p>
            <p className="stat-value">{stats.totalLessons}</p>
          </article>

          <article className="stat-card">
            <p className="stat-label">Total sessions</p>
            <p className="stat-value">{stats.totalSessions}</p>
          </article>

          <article className="stat-card">
            <p className="stat-label">Tasks</p>
            <p className="stat-value">{stats.tasksTodoDoing}</p>
            <p className="stat-subvalue">todo/doing</p>
            <p className="stat-subvalue">done: {stats.tasksDone}</p>
          </article>
        </div>
      )}

      <div className="section-block" style={{ marginTop: 20 }}>
        <h3 className="subsection-title">Que veux-tu faire maintenant ?</h3>
        <p className="section-subtitle" style={{ marginBottom: 12 }}>
          Actions rapides pour avancer sur ta formation.
        </p>

        {actionsError && <div className="error-box">Action rapide indisponible: {actionsError}</div>}
        {actionsLoading && <p className="muted">Chargement des actions...</p>}

        {!actionsLoading && (
          <div className="card-grid">
            {formationAction ? (
              <button type="button" className="card-button" onClick={handleFormationAction}>
                <h4 className="card-title">Reprendre la formation</h4>
                <p className="card-text">{formationReason}</p>
                <p className="card-meta" style={{ marginTop: 10 }}>
                  Ouvre l'onglet Formation pour continuer.
                </p>
              </button>
            ) : (
              <article className="card" style={{ opacity: 0.72 }}>
                <h4 className="card-title">Reprendre la formation</h4>
                <p className="card-text">{formationReason}</p>
              </article>
            )}

            {quizAction ? (
              <button type="button" className="card-button" onClick={handleQuizAction}>
                <h4 className="card-title">Tenter le quiz</h4>
                <p className="card-text">{quizReason}</p>
                <p className="card-meta" style={{ marginTop: 10 }}>
                  Ouvre le module puis l'onglet Quiz.
                </p>
              </button>
            ) : (
              <article className="card" style={{ opacity: 0.72 }}>
                <h4 className="card-title">Tenter le quiz</h4>
                <p className="card-text">{quizReason}</p>
              </article>
            )}

            {coachingAction ? (
              <a href={coachingAction.bookingUrl} target="_blank" rel="noreferrer" className="card-button">
                <h4 className="card-title">{coachingAction.isReplanification ? "Replanifier un coaching" : "Réserver un coaching"}</h4>
                <p className="card-text">{coachingReason}</p>
                <p className="card-meta" style={{ marginTop: 10 }}>
                  Ouvre Calendly dans un nouvel onglet.
                </p>
              </a>
            ) : (
              <article className="card" style={{ opacity: 0.72 }}>
                <h4 className="card-title">Réserver un coaching</h4>
                <p className="card-text">{coachingReason}</p>
              </article>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
