import { useEffect, useState } from "react";
import TasksWidget from "../components/TasksWidget";
import { registerEngagementAction } from "../lib/engagement";
import { supabase } from "../lib/supabase";

type ModuleItem = {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_published: boolean | null;
};

type ModuleLesson = {
  id: string;
  module_id: string | null;
  title: string;
  order_index: number;
  duration_min: number | null;
  content_type: string | null;
  tella_url: string | null;
  content_markdown: string | null;
  is_published: boolean | null;
};

type SessionItem = {
  id: string;
  status: string | null;
  order_index: number | null;
  created_at: string | null;
  theme: string | null;
  objective: string | null;
  booking_url: string | null;
  scheduled_at: string | null;
};

type TaskItem = {
  id: string;
  title: string;
  priority: string | null;
  due_date: string | null;
  est_minutes: number | null;
  status: string | null;
  updated_at?: string | null;
};

type QuizQuestionRow = {
  id: string;
  order_index: number;
  prompt: string;
  explanation: string | null;
};

type QuizChoiceRow = {
  id: string;
  question_id: string;
  order_index: number;
  label: string;
  is_correct: boolean;
};

type QuizQuestion = QuizQuestionRow & {
  choices: QuizChoiceRow[];
};

function parseDate(dateValue: string | null | undefined) {
  if (!dateValue) {
    return null;
  }

  const timestamp = Date.parse(dateValue);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return timestamp;
}

function formatDueDate(dueDate: string | null) {
  if (!dueDate) {
    return "Sans échéance";
  }

  const timestamp = Date.parse(dueDate);
  if (Number.isNaN(timestamp)) {
    return "Sans échéance";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

function formatDate(dateValue: string | null | undefined) {
  const timestamp = parseDate(dateValue);
  if (timestamp === null) {
    return null;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function isDoneTask(task: TaskItem) {
  return task.status?.toLowerCase() === "done";
}

function getPriorityLabel(priority: string | null) {
  const normalized = priority?.toLowerCase();

  if (normalized === "high") {
    return "Priorité haute";
  }
  if (normalized === "medium") {
    return "Priorité moyenne";
  }
  if (normalized === "low") {
    return "Priorité basse";
  }

  return "Priorité non définie";
}

function compareDueDateAscNullsLast(aDate: string | null, bDate: string | null) {
  const a = parseDate(aDate);
  const b = parseDate(bDate);

  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }

  return a - b;
}

function compareDueDateDescNullsLast(aDate: string | null, bDate: string | null) {
  const a = parseDate(aDate);
  const b = parseDate(bDate);

  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }

  return b - a;
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateKeyReadable(dateKey: string) {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateKey;
  }

  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date(year, month - 1, day));
}

function isMissingModulesTable(error: { code?: string; message: string }) {
  const message = error.message.toLowerCase();
  return error.code === "42P01" || (message.includes("does not exist") && message.includes("modules"));
}

function isMissingQuizTable(error: { code?: string; message: string }) {
  const message = error.message.toLowerCase();
  return (
    error.code === "42P01" ||
    (message.includes("does not exist") &&
      (message.includes("module_quizzes") ||
        message.includes("quiz_questions") ||
        message.includes("quiz_choices") ||
        message.includes("module_quiz_progress")))
  );
}

function isMissingLessonProgressTable(error: { code?: string; message: string }) {
  const message = error.message.toLowerCase();
  return error.code === "42P01" || (message.includes("does not exist") && message.includes("lesson_progress"));
}

function isMissingSessionsTable(error: { code?: string; message: string }) {
  const message = error.message.toLowerCase();
  return error.code === "42P01" || (message.includes("does not exist") && message.includes("sessions"));
}

function isMissingTasksTable(error: { code?: string; message: string }) {
  const message = error.message.toLowerCase();
  return error.code === "42P01" || (message.includes("does not exist") && message.includes("tasks"));
}

function isMissingUserEngagementTable(error: { code?: string; message: string }) {
  const message = error.message.toLowerCase();
  return error.code === "42P01" || (message.includes("does not exist") && message.includes("user_engagement"));
}

function isOrderIndexMissingColumnError(errorMessage: string) {
  const normalizedMessage = errorMessage.toLowerCase();
  return normalizedMessage.includes("order_index") && (normalizedMessage.includes("column") || normalizedMessage.includes("does not exist"));
}

function isValidHttpUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function sortBySessionOrder(a: SessionItem, b: SessionItem) {
  const orderA = a.order_index ?? Number.POSITIVE_INFINITY;
  const orderB = b.order_index ?? Number.POSITIVE_INFINITY;
  if (orderA !== orderB) {
    return orderA - orderB;
  }

  const createdAtA = parseDate(a.created_at);
  const createdAtB = parseDate(b.created_at);
  if (createdAtA !== null && createdAtB !== null && createdAtA !== createdAtB) {
    return createdAtA - createdAtB;
  }
  if (createdAtA === null && createdAtB !== null) {
    return 1;
  }
  if (createdAtA !== null && createdAtB === null) {
    return -1;
  }

  return a.id.localeCompare(b.id, "fr");
}

function getLessonTypeLabel(contentType: string | null) {
  return contentType?.toLowerCase() === "video" ? "Vidéo" : "Lecture";
}

function hashStringToInt(value: string) {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mulberry32(seed: number) {
  let currentSeed = seed >>> 0;

  return function random() {
    currentSeed += 0x6d2b79f5;
    let t = currentSeed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng<T>(array: T[], rng: () => number) {
  const values = [...array];

  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const temp = values[index];
    values[index] = values[swapIndex];
    values[swapIndex] = temp;
  }

  return values;
}

export default function StatsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [moduleLessons, setModuleLessons] = useState<ModuleLesson[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [streakCurrent, setStreakCurrent] = useState(0);

  const [formationError, setFormationError] = useState("");
  const [sessionsLoadError, setSessionsLoadError] = useState("");
  const [tasksLoadError, setTasksLoadError] = useState("");
  const [badgeLoadError, setBadgeLoadError] = useState("");
  const [quizDataError, setQuizDataError] = useState("");

  const [completedByLessonId, setCompletedByLessonId] = useState<Record<string, boolean>>({});
  const [lessonProgressMessage, setLessonProgressMessage] = useState("");
  const [lessonProgressSubmittingId, setLessonProgressSubmittingId] = useState<string | null>(null);

  const [passedByModuleId, setPassedByModuleId] = useState<Record<string, boolean>>({});
  const [quizRequiredByModuleId, setQuizRequiredByModuleId] = useState<Record<string, boolean>>({});

  const [activeModule, setActiveModule] = useState<ModuleItem | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"lessons" | "quiz">("lessons");

  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState("");
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [shuffledChoicesByQuestionId, setShuffledChoicesByQuestionId] = useState<Record<string, QuizChoiceRow[]>>({});
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [passed, setPassed] = useState<boolean | null>(null);
  const [quizUnavailable, setQuizUnavailable] = useState(false);
  const [quizSubmitMessage, setQuizSubmitMessage] = useState("");
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [loadedQuizModuleId, setLoadedQuizModuleId] = useState<string | null>(null);
  const [selectedCalendarDateKey, setSelectedCalendarDateKey] = useState<string | null>(null);
  const [showAllSessionsModal, setShowAllSessionsModal] = useState(false);
  const [sessionsModalTab, setSessionsModalTab] = useState<"upcoming" | "past">("upcoming");
  const [showAllTasksModal, setShowAllTasksModal] = useState(false);
  const [tasksModalTab, setTasksModalTab] = useState<"todo" | "done">("todo");
  const [showBadgesModal, setShowBadgesModal] = useState(false);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      setLoading(true);
      setError("");
      setFormationError("");
      setSessionsLoadError("");
      setTasksLoadError("");
      setBadgeLoadError("");
      setQuizDataError("");

      const { data: userData, error: userError } = await supabase.auth.getUser();
      const currentUserId = userError ? null : (userData.user?.id ?? null);

      if (!isMounted) {
        return;
      }

      setUserId(currentUserId);

      if (!currentUserId) {
        setError("Impossible d'identifier l'utilisateur.");
        setLoading(false);
        return;
      }

      const { data: userEngagementRow, error: userEngagementError } = await supabase
        .from("user_engagement")
        .select("streak_current")
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (userEngagementError) {
        if (!isMissingUserEngagementTable(userEngagementError)) {
          setBadgeLoadError(`Impossible de charger le badge actuel : ${userEngagementError.message}`);
        }
        setStreakCurrent(0);
      } else {
        setStreakCurrent(Number(userEngagementRow?.streak_current ?? 0));
      }

      const { data: modulesData, error: modulesError } = await supabase
        .from("modules")
        .select("id,title,description,order_index,is_published")
        .eq("is_published", true)
        .order("order_index", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (modulesError) {
        if (isMissingModulesTable(modulesError)) {
          setFormationError("La table modules est indisponible pour le moment.");
        } else {
          setFormationError(`Impossible de charger les modules : ${modulesError.message}`);
        }
      } else {
        const moduleRows = (modulesData ?? []) as ModuleItem[];
        setModules(moduleRows);

        const { data: lessonsData, error: lessonsError } = await supabase
          .from("lessons")
          .select("id,module_id,title,order_index,duration_min,content_type,tella_url,content_markdown,is_published")
          .eq("is_published", true)
          .order("order_index", { ascending: true });

        if (!isMounted) {
          return;
        }

        if (lessonsError) {
          setFormationError(`Impossible de charger les leçons : ${lessonsError.message}`);
        } else {
          setModuleLessons((lessonsData ?? []) as ModuleLesson[]);
        }

        const { data: lessonProgressRows, error: lessonProgressError } = await supabase
          .from("lesson_progress")
          .select("lesson_id")
          .eq("user_id", currentUserId)
          .eq("status", "done");

        if (!isMounted) {
          return;
        }

        if (lessonProgressError) {
          if (isMissingLessonProgressTable(lessonProgressError)) {
            setFormationError((current) => current || "La progression des leçons est indisponible pour le moment.");
          } else {
            setFormationError(`Impossible de charger la progression des leçons : ${lessonProgressError.message}`);
          }
        } else {
          const nextCompletedByLessonId: Record<string, boolean> = {};
          for (const row of (lessonProgressRows ?? []) as Array<{ lesson_id: string | null }>) {
            if (row.lesson_id) {
              nextCompletedByLessonId[row.lesson_id] = true;
            }
          }
          setCompletedByLessonId(nextCompletedByLessonId);
        }

        const { data: progressRows, error: progressError } = await supabase
          .from("module_quiz_progress")
          .select("module_id,passed")
          .eq("user_id", currentUserId);

        if (!isMounted) {
          return;
        }

        if (progressError) {
          if (!isMissingQuizTable(progressError)) {
            setQuizDataError(`Impossible de charger la progression quiz : ${progressError.message}`);
          } else {
            setQuizDataError("Progression quiz indisponible pour le moment.");
          }
        } else {
          const nextPassedByModuleId: Record<string, boolean> = {};
          for (const row of (progressRows ?? []) as Array<{ module_id: string | null; passed: boolean | null }>) {
            if (row.module_id && row.passed === true) {
              nextPassedByModuleId[row.module_id] = true;
            }
          }
          setPassedByModuleId(nextPassedByModuleId);
        }

        if (moduleRows.length > 0) {
          const moduleIds = moduleRows.map((module) => module.id);
          const { data: moduleQuizRows, error: moduleQuizRowsError } = await supabase
            .from("module_quizzes")
            .select("module_id,is_published")
            .in("module_id", moduleIds);

          if (!isMounted) {
            return;
          }

          if (moduleQuizRowsError) {
            if (!isMissingQuizTable(moduleQuizRowsError)) {
              setQuizDataError((current) => current || `Impossible de charger les quiz : ${moduleQuizRowsError.message}`);
            } else {
              setQuizDataError((current) => current || "Quiz indisponibles pour le moment.");
            }
          } else {
            const nextQuizRequiredByModuleId: Record<string, boolean> = {};
            for (const row of (moduleQuizRows ?? []) as Array<{ module_id: string | null; is_published: boolean | null }>) {
              if (row.module_id && row.is_published === true) {
                nextQuizRequiredByModuleId[row.module_id] = true;
              }
            }
            setQuizRequiredByModuleId(nextQuizRequiredByModuleId);
          }
        }
      }

      const primarySelect = "id,status,order_index,created_at,theme,objective,booking_url,scheduled_at";
      const fallbackSelect = "id,status,created_at,theme,objective,booking_url,scheduled_at";

      let disableOrderIndex = false;
      let { data: sessionsData, error: sessionsError } = await supabase
        .from("sessions")
        .select(primarySelect)
        .eq("user_id", currentUserId)
        .order("scheduled_at", { ascending: true });

      if (sessionsError && isOrderIndexMissingColumnError(sessionsError.message)) {
        disableOrderIndex = true;
        const fallbackResult = await supabase
          .from("sessions")
          .select(fallbackSelect)
          .eq("user_id", currentUserId)
          .order("scheduled_at", { ascending: true });
        sessionsData = fallbackResult.data as SessionItem[] | null;
        sessionsError = fallbackResult.error;
      }

      if (!isMounted) {
        return;
      }

      if (sessionsError) {
        if (isMissingSessionsTable(sessionsError)) {
          setSessionsLoadError("La table des séances est indisponible pour le moment.");
        } else {
          setSessionsLoadError(`Impossible de charger les séances : ${sessionsError.message}`);
        }
      } else {
        const normalizedSessions = disableOrderIndex
          ? ((sessionsData ?? []) as Array<Omit<SessionItem, "order_index">>).map((session) => ({ ...session, order_index: null }))
          : ((sessionsData ?? []) as SessionItem[]);
        setSessions(normalizedSessions);
      }

      const tasksSelectWithUpdatedAt = "id,title,priority,due_date,est_minutes,status,updated_at";
      const tasksSelectFallback = "id,title,priority,due_date,est_minutes,status";

      let tasksData: TaskItem[] | null = null;
      let tasksError: { code?: string; message: string } | null = null;

      const tasksWithUpdatedAt = await supabase.from("tasks").select(tasksSelectWithUpdatedAt);
      if (tasksWithUpdatedAt.error) {
        if (tasksWithUpdatedAt.error.message.toLowerCase().includes("updated_at")) {
          const fallbackTasks = await supabase.from("tasks").select(tasksSelectFallback);
          tasksData = ((fallbackTasks.data ?? []) as TaskItem[]).map((task) => ({ ...task, updated_at: null }));
          tasksError = fallbackTasks.error;
        } else {
          tasksError = tasksWithUpdatedAt.error;
        }
      } else {
        tasksData = (tasksWithUpdatedAt.data ?? []) as TaskItem[];
      }

      if (!isMounted) {
        return;
      }

      if (tasksError) {
        if (isMissingTasksTable(tasksError)) {
          setTasksLoadError("La table des tâches est indisponible pour le moment.");
        } else {
          setTasksLoadError(`Impossible de charger les tâches : ${tasksError.message}`);
        }
      } else {
        const normalizedTasks = ((tasksData ?? []) as TaskItem[]).map((task) => ({
          ...task,
          updated_at: task.updated_at ?? null,
        }));
        setTasks(normalizedTasks);
      }

      setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

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

  const nextFormationAction = (() => {
    for (const module of modulesSorted) {
      if (unlockedByModuleId[module.id] !== true) {
        continue;
      }

      const lessons = moduleLessons.filter((lesson) => lesson.module_id === module.id).sort((a, b) => a.order_index - b.order_index);
      const nextLesson = lessons.find((lesson) => completedByLessonId[lesson.id] !== true);
      if (nextLesson) {
        return {
          module,
          lesson: nextLesson,
        };
      }
    }

    return null;
  })();

  const nextQuizAction = (() => {
    for (const module of modulesSorted) {
      if (unlockedByModuleId[module.id] !== true) {
        continue;
      }

      const moduleHasQuiz = quizRequiredByModuleId[module.id] === true;
      const modulePassedQuiz = passedByModuleId[module.id] === true;
      if (moduleHasQuiz && !modulePassedQuiz) {
        return module;
      }
    }

    return null;
  })();

  const nextCoachingSession = [...sessions]
    .filter((session) => session.status?.toLowerCase() !== "completed")
    .sort(sortBySessionOrder)[0] ?? null;

  const now = Date.now();
  const upcomingSessionsAll = sessions
    .filter((session) => {
      const scheduledAt = parseDate(session.scheduled_at);
      return session.status?.toLowerCase() === "planned" && scheduledAt !== null && scheduledAt >= now;
    })
    .sort((a, b) => {
      const timeA = parseDate(a.scheduled_at);
      const timeB = parseDate(b.scheduled_at);
      if (timeA === null && timeB === null) {
        return 0;
      }
      if (timeA === null) {
        return 1;
      }
      if (timeB === null) {
        return -1;
      }
      return timeA - timeB;
    });

  const pastSessionsAll = [...sessions]
    .filter((session) => {
      const status = session.status?.toLowerCase();
      const scheduledAt = parseDate(session.scheduled_at);
      return status === "completed" || (scheduledAt !== null && scheduledAt < now);
    })
    .sort((a, b) => {
      const timeA = parseDate(a.scheduled_at);
      const timeB = parseDate(b.scheduled_at);

      if (timeA !== null && timeB !== null && timeA !== timeB) {
        return timeB - timeA;
      }
      if (timeA === null && timeB !== null) {
        return 1;
      }
      if (timeA !== null && timeB === null) {
        return -1;
      }

      return sortBySessionOrder(a, b);
    });

  const upcomingSessions = upcomingSessionsAll.slice(0, 3);

  const todoTasks = tasks
    .filter((task) => !isDoneTask(task))
    .sort((a, b) => {
      const dueDateDiff = compareDueDateAscNullsLast(a.due_date, b.due_date);
      if (dueDateDiff !== 0) {
        return dueDateDiff;
      }
      return a.title.localeCompare(b.title, "fr");
    });

  const doneTasks = tasks
    .filter((task) => isDoneTask(task))
    .sort((a, b) => {
      const updatedA = parseDate(a.updated_at);
      const updatedB = parseDate(b.updated_at);

      if (updatedA !== null || updatedB !== null) {
        if (updatedA === null && updatedB !== null) {
          return 1;
        }
        if (updatedA !== null && updatedB === null) {
          return -1;
        }
        if (updatedA !== null && updatedB !== null && updatedA !== updatedB) {
          return updatedB - updatedA;
        }
      }

      const dueDateDiff = compareDueDateDescNullsLast(a.due_date, b.due_date);
      if (dueDateDiff !== 0) {
        return dueDateDiff;
      }

      return a.title.localeCompare(b.title, "fr");
    });

  const lessonsDoneCount = Object.keys(completedByLessonId).length;
  const quizPassedCount = Object.values(passedByModuleId).filter((value) => value === true).length;
  const coachingScheduledCount = sessions.filter((session) => parseDate(session.scheduled_at) !== null).length;
  const coachingCompletedCount = sessions.filter((session) => session.status?.toLowerCase() === "completed").length;

  const badges = [
    {
      id: "parcours_lance",
      name: "Parcours lancé",
      conditionText: "Terminer 5 leçons",
      unlocked: lessonsDoneCount >= 5,
      reachedText: `${lessonsDoneCount} leçon${lessonsDoneCount > 1 ? "s" : ""} terminée${lessonsDoneCount > 1 ? "s" : ""}`,
    },
    {
      id: "module_valide_i",
      name: "Module validé I",
      conditionText: "Valider 1 quiz",
      unlocked: quizPassedCount >= 1,
      reachedText: `${quizPassedCount} quiz réussi${quizPassedCount > 1 ? "s" : ""}`,
    },
    {
      id: "module_valide_ii",
      name: "Module validé II",
      conditionText: "Valider 3 quiz",
      unlocked: quizPassedCount >= 3,
      reachedText: `${quizPassedCount} quiz réussi${quizPassedCount > 1 ? "s" : ""}`,
    },
    {
      id: "module_valide_iii",
      name: "Module validé III",
      conditionText: "Valider 5 quiz",
      unlocked: quizPassedCount >= 5,
      reachedText: `${quizPassedCount} quiz réussi${quizPassedCount > 1 ? "s" : ""}`,
    },
    {
      id: "coaching_confirme",
      name: "Coaching confirmé",
      conditionText: "Confirmer 1 coaching",
      unlocked: coachingScheduledCount >= 1,
      reachedText: `${coachingScheduledCount} coaching planifié${coachingScheduledCount > 1 ? "s" : ""}`,
    },
    {
      id: "coaching_complete",
      name: "Coaching complété",
      conditionText: "Compléter 1 coaching",
      unlocked: coachingCompletedCount >= 1,
      reachedText: `${coachingCompletedCount} coaching complété${coachingCompletedCount > 1 ? "s" : ""}`,
    },
    {
      id: "regularite_i",
      name: "Régularité I",
      conditionText: "Atteindre une série de 2",
      unlocked: streakCurrent >= 2,
      reachedText: `Série actuelle : ${streakCurrent}`,
    },
    {
      id: "regularite_ii",
      name: "Régularité II",
      conditionText: "Atteindre une série de 4",
      unlocked: streakCurrent >= 4,
      reachedText: `Série actuelle : ${streakCurrent}`,
    },
  ];

  const currentBadge = (
    [
      "module_valide_iii",
      "module_valide_ii",
      "module_valide_i",
      "coaching_complete",
      "coaching_confirme",
      "regularite_ii",
      "regularite_i",
      "parcours_lance",
    ] as const
  )
    .map((badgeId) => badges.find((badge) => badge.id === badgeId))
    .find((badge) => badge?.unlocked === true) ?? null;

  const sessionsByDateKey: Record<string, SessionItem[]> = {};
  for (const session of sessions) {
    const sessionTimestamp = parseDate(session.scheduled_at);
    if (sessionTimestamp === null) {
      continue;
    }

    const dateKey = toLocalDateKey(new Date(sessionTimestamp));
    const list = sessionsByDateKey[dateKey] ?? [];
    list.push(session);
    sessionsByDateKey[dateKey] = list;
  }

  for (const dateKey of Object.keys(sessionsByDateKey)) {
    sessionsByDateKey[dateKey].sort((a, b) => {
      const timeA = parseDate(a.scheduled_at) ?? 0;
      const timeB = parseDate(b.scheduled_at) ?? 0;
      return timeA - timeB;
    });
  }

  const nowDate = new Date();
  const currentMonthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
  const currentMonthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(currentMonthStart);
  const firstWeekdayOffset = (currentMonthStart.getDay() + 6) % 7;
  const daysInCurrentMonth = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 0).getDate();
  const weekdayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  const calendarCells: Array<{ kind: "empty" } | { kind: "day"; day: number; dateKey: string; hasSessions: boolean }> = [];

  for (let index = 0; index < firstWeekdayOffset; index += 1) {
    calendarCells.push({ kind: "empty" });
  }

  for (let day = 1; day <= daysInCurrentMonth; day += 1) {
    const date = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth(), day);
    const dateKey = toLocalDateKey(date);
    const hasSessions = Boolean(sessionsByDateKey[dateKey]?.length);
    calendarCells.push({ kind: "day", day, dateKey, hasSessions });
  }

  while (calendarCells.length % 7 !== 0) {
    calendarCells.push({ kind: "empty" });
  }

  const sessionsCountInCurrentMonth = Object.entries(sessionsByDateKey).filter(([dateKey]) => {
    const [yearRaw, monthRaw] = dateKey.split("-");
    return Number(yearRaw) === currentMonthStart.getFullYear() && Number(monthRaw) === currentMonthStart.getMonth() + 1;
  }).length;

  const selectedDaySessions = selectedCalendarDateKey ? sessionsByDateKey[selectedCalendarDateKey] ?? [] : [];
  const selectedDateReadable = selectedCalendarDateKey ? formatDateKeyReadable(selectedCalendarDateKey) : "";

  const activeModuleLessons = activeModule
    ? moduleLessons.filter((lesson) => lesson.module_id === activeModule.id).sort((a, b) => a.order_index - b.order_index)
    : [];
  const activeLesson = activeModuleLessons.find((lesson) => lesson.id === activeLessonId) ?? activeModuleLessons[0] ?? null;
  const isActiveLessonCompleted = activeLesson ? completedByLessonId[activeLesson.id] === true : false;
  const isActiveModuleUnlocked = activeModule ? unlockedByModuleId[activeModule.id] === true : false;

  function openModule(module: ModuleItem, tab: "lessons" | "quiz" = "lessons", lessonId: string | null = null) {
    if (unlockedByModuleId[module.id] !== true) {
      return;
    }

    const lessons = moduleLessons.filter((item) => item.module_id === module.id).sort((a, b) => a.order_index - b.order_index);

    setActiveModule(module);
    setActiveLessonId(lessonId ?? lessons[0]?.id ?? null);
    setActiveTab(tab);
    setLoadedQuizModuleId(null);
    setQuizSubmitMessage("");
  }

  function closeModuleModal() {
    setActiveModule(null);
    setActiveLessonId(null);
    setActiveTab("lessons");
    setQuizSubmitMessage("");
  }

  function handleOpenFormationAction() {
    if (!nextFormationAction) {
      return;
    }

    openModule(nextFormationAction.module, "lessons", nextFormationAction.lesson.id);
  }

  function handleOpenQuizAction() {
    if (!nextQuizAction) {
      return;
    }

    openModule(nextQuizAction, "quiz", null);
  }

  async function markLessonAsCompleted(lessonId: string) {
    if (completedByLessonId[lessonId] === true || lessonProgressSubmittingId === lessonId) {
      return;
    }

    let currentUserId = userId;
    if (!currentUserId) {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.id) {
        setLessonProgressMessage("Impossible d'identifier l'utilisateur.");
        return;
      }

      currentUserId = userData.user.id;
      setUserId(currentUserId);
    }

    if (!currentUserId) {
      setLessonProgressMessage("Impossible d'identifier l'utilisateur.");
      return;
    }

    setLessonProgressMessage("");
    setLessonProgressSubmittingId(lessonId);

    try {
      const nowIso = new Date().toISOString();
      const { error: lessonProgressError } = await supabase.from("lesson_progress").upsert(
        {
          user_id: currentUserId,
          lesson_id: lessonId,
          status: "done",
          done_at: nowIso,
        },
        { onConflict: "user_id,lesson_id" }
      );

      if (lessonProgressError) {
        setLessonProgressMessage(`Impossible d'enregistrer la progression de la leçon : ${lessonProgressError.message}`);
        return;
      }

      setCompletedByLessonId((current) => ({ ...current, [lessonId]: true }));
      setLessonProgressMessage("Leçon terminée.");

      void (async () => {
        try {
          const result = await registerEngagementAction({
            userId: currentUserId,
            eventKey: `lesson_done:${lessonId}`,
            xpGain: 10,
          });

          if (result.applied) {
            window.dispatchEvent(new CustomEvent("tf:engagement", { detail: result }));
          }
        } catch (engagementError) {
          console.warn("Impossible d'attribuer les XP de la leçon.", engagementError);
        }
      })();
    } catch (progressError) {
      const err = progressError as { message?: string };
      setLessonProgressMessage(`Impossible d'enregistrer la progression de la leçon : ${err.message ?? "Erreur inconnue."}`);
    } finally {
      setLessonProgressSubmittingId((current) => (current === lessonId ? null : current));
    }
  }

  useEffect(() => {
    if (activeTab !== "quiz" || !activeModule) {
      return;
    }

    if (loadedQuizModuleId === activeModule.id) {
      return;
    }

    let isMounted = true;

    (async () => {
      setQuizLoading(true);
      setQuizError("");
      setQuizUnavailable(false);
      setQuizQuestions([]);
      setShuffledChoicesByQuestionId({});
      setSelectedAnswers({});
      setPassed(null);
      setQuizSubmitMessage("");
      setQuizSubmitting(false);

      const { data: quizRows, error: moduleQuizError } = await supabase
        .from("module_quizzes")
        .select("id")
        .eq("module_id", activeModule.id)
        .order("id", { ascending: true })
        .limit(1);

      if (!isMounted) {
        return;
      }

      if (moduleQuizError) {
        if (isMissingQuizTable(moduleQuizError)) {
          setQuizUnavailable(true);
          setLoadedQuizModuleId(activeModule.id);
          setQuizLoading(false);
          return;
        }

        setQuizError(moduleQuizError.message);
        setLoadedQuizModuleId(activeModule.id);
        setQuizLoading(false);
        return;
      }

      const quizId = quizRows?.[0]?.id;
      if (!quizId) {
        setQuizUnavailable(true);
        setLoadedQuizModuleId(activeModule.id);
        setQuizLoading(false);
        return;
      }

      const { data: questionRows, error: questionError } = await supabase
        .from("quiz_questions")
        .select("id,order_index,prompt,explanation")
        .eq("quiz_id", quizId)
        .order("order_index", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (questionError) {
        if (isMissingQuizTable(questionError)) {
          setQuizUnavailable(true);
          setLoadedQuizModuleId(activeModule.id);
          setQuizLoading(false);
          return;
        }

        setQuizError(questionError.message);
        setLoadedQuizModuleId(activeModule.id);
        setQuizLoading(false);
        return;
      }

      const questions = (questionRows ?? []) as QuizQuestionRow[];
      if (questions.length === 0) {
        setQuizUnavailable(true);
        setLoadedQuizModuleId(activeModule.id);
        setQuizLoading(false);
        return;
      }

      const questionIds = questions.map((question) => question.id);
      const { data: choiceRows, error: choiceError } = await supabase
        .from("quiz_choices")
        .select("id,question_id,order_index,label,is_correct")
        .in("question_id", questionIds)
        .order("order_index", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (choiceError) {
        if (isMissingQuizTable(choiceError)) {
          setQuizUnavailable(true);
          setLoadedQuizModuleId(activeModule.id);
          setQuizLoading(false);
          return;
        }

        setQuizError(choiceError.message);
        setLoadedQuizModuleId(activeModule.id);
        setQuizLoading(false);
        return;
      }

      const choices = (choiceRows ?? []) as QuizChoiceRow[];
      const choicesByQuestion = new Map<string, QuizChoiceRow[]>();
      for (const choice of choices) {
        const list = choicesByQuestion.get(choice.question_id) ?? [];
        list.push(choice);
        choicesByQuestion.set(choice.question_id, list);
      }

      const structuredQuestions: QuizQuestion[] = questions
        .sort((a, b) => a.order_index - b.order_index)
        .map((question) => ({
          ...question,
          choices: (choicesByQuestion.get(question.id) ?? []).sort((a, b) => a.order_index - b.order_index),
        }));

      const shuffledMap: Record<string, QuizChoiceRow[]> = {};
      for (const question of structuredQuestions) {
        const seedString = userId ? `${userId}:${activeModule.id}:${question.id}` : `${activeModule.id}:${question.id}`;
        const seed = hashStringToInt(seedString);
        const rng = mulberry32(seed);
        shuffledMap[question.id] = shuffleWithRng(question.choices, rng);
      }

      setQuizQuestions(structuredQuestions);
      setShuffledChoicesByQuestionId(shuffledMap);

      if (userId) {
        const { data: progressRows, error: progressError } = await supabase
          .from("module_quiz_progress")
          .select("passed")
          .eq("user_id", userId)
          .eq("module_id", activeModule.id)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (!isMounted) {
          return;
        }

        if (progressError) {
          if (isMissingQuizTable(progressError)) {
            setQuizUnavailable(true);
            setQuizQuestions([]);
            setLoadedQuizModuleId(activeModule.id);
            setQuizLoading(false);
            return;
          }

          setQuizError(progressError.message);
          setLoadedQuizModuleId(activeModule.id);
          setQuizLoading(false);
          return;
        }

        const modulePassed = progressRows?.[0]?.passed === true;
        setPassed(modulePassed);
        setPassedByModuleId((current) => ({ ...current, [activeModule.id]: modulePassed }));
      } else {
        setPassed(false);
      }

      setLoadedQuizModuleId(activeModule.id);
      setQuizLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, [activeTab, activeModule, loadedQuizModuleId, userId]);

  async function submitQuiz() {
    if (!activeModule || quizUnavailable || quizLoading || quizSubmitting || passed === true || quizQuestions.length === 0) {
      return;
    }

    const hasMissingAnswers = quizQuestions.some((question) => !selectedAnswers[question.id]);
    if (hasMissingAnswers) {
      setQuizSubmitMessage("Réponds à toutes les questions avant de soumettre.");
      return;
    }

    const allCorrect = quizQuestions.every((question) => {
      const selectedChoiceId = selectedAnswers[question.id];
      const selectedChoice = question.choices.find((choice) => choice.id === selectedChoiceId);
      return selectedChoice?.is_correct === true;
    });

    if (!allCorrect) {
      setQuizSubmitMessage("Certaines réponses sont incorrectes. Réessaie.");
      return;
    }

    setQuizSubmitting(true);
    setQuizSubmitMessage("");

    let currentUserId = userId;
    if (!currentUserId) {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.id) {
        setQuizSubmitMessage("Impossible d'identifier l'utilisateur.");
        setQuizSubmitting(false);
        return;
      }
      currentUserId = userData.user.id;
      setUserId(currentUserId);
    }

    if (!currentUserId) {
      setQuizSubmitMessage("Impossible d'identifier l'utilisateur.");
      setQuizSubmitting(false);
      return;
    }

    const nowIso = new Date().toISOString();
    const { error: upsertError } = await supabase.from("module_quiz_progress").upsert(
      {
        user_id: currentUserId,
        module_id: activeModule.id,
        passed: true,
        passed_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "user_id,module_id" }
    );

    if (upsertError) {
      if (isMissingQuizTable(upsertError)) {
        setQuizUnavailable(true);
        setQuizQuestions([]);
        setQuizSubmitMessage("Quiz non disponible.");
      } else {
        setQuizSubmitMessage("Impossible d'enregistrer le résultat du quiz.");
      }
      setQuizSubmitting(false);
      return;
    }

    setPassed(true);
    setPassedByModuleId((current) => ({ ...current, [activeModule.id]: true }));
    setQuizSubmitMessage("Quiz réussi.");
    setQuizSubmitting(false);

    void (async () => {
      try {
        const result = await registerEngagementAction({
          userId: currentUserId,
          eventKey: `quiz_passed:${activeModule.id}`,
          xpGain: 60,
        });

        if (result.applied) {
          window.dispatchEvent(new CustomEvent("tf:engagement", { detail: result }));
        }
      } catch (engagementError) {
        console.warn("Impossible d'attribuer les XP du quiz.", engagementError);
      }
    })();
  }

  return (
    <section>
      <h2 className="section-title">Dashboard</h2>
      <p className="section-subtitle">Ton espace unique pour avancer sur ta formation et ton coaching.</p>

      {error && <div className="error-box">{error}</div>}
      {loading && <p className="muted">Chargement...</p>}

      {!loading && (
        <>
          <div className="card-grid">
            <article className="card">
              <h3 className="card-title">Formation en cours</h3>
              <p className="card-text">
                {nextFormationAction
                  ? `Leçon suivante : ${nextFormationAction.lesson.title} (Module ${nextFormationAction.module.title}).`
                  : "Aucune leçon à reprendre pour le moment."}
              </p>
              <div className="card-action">
                <button type="button" className="btn btn-primary" onClick={handleOpenFormationAction} disabled={!nextFormationAction}>
                  Reprendre la formation
                </button>
              </div>
            </article>

            <article className="card">
              <h3 className="card-title">Coaching personnel</h3>
              <p className="card-text">
                {nextCoachingSession
                  ? `Séance débloquée : ${nextCoachingSession.theme ?? "Séance sans thème"}.`
                  : "Aucun coaching prévu pour le moment."}
              </p>
              <div className="card-action">
                {nextCoachingSession && isValidHttpUrl(nextCoachingSession.booking_url) ? (
                  <a href={nextCoachingSession.booking_url ?? "#"} target="_blank" rel="noreferrer" className="btn btn-primary">
                    Prendre un rendez-vous
                  </a>
                ) : (
                  <button type="button" className="btn" disabled>
                    Prendre un rendez-vous
                  </button>
                )}
              </div>
            </article>
          </div>

          <div className="section-block" style={{ marginTop: 20 }}>
            <button
              type="button"
              className="card-button"
              onClick={() => setShowBadgesModal(true)}
              aria-label="Voir tous mes badges"
              style={{ width: "100%", textAlign: "left" }}
            >
              <p className="card-meta">Badge actuel</p>
              <h3 className="card-title">{currentBadge ? currentBadge.name : "Aucun badge"}</h3>
              <p className="card-text">
                {currentBadge ? currentBadge.reachedText : "Commence par terminer une leçon."}
              </p>
            </button>
            {badgeLoadError && (
              <p className="card-meta" style={{ marginTop: 8, color: "#991b1b" }}>
                {badgeLoadError}
              </p>
            )}
          </div>

          <div className="section-block" style={{ marginTop: 20 }}>
            <h3 className="subsection-title">Que veux-tu faire maintenant ?</h3>
            <p className="section-subtitle" style={{ marginBottom: 12 }}>
              Actions rapides pour avancer.
            </p>

            {(formationError || sessionsLoadError || quizDataError) && (
              <div className="error-box">
                {formationError || sessionsLoadError || quizDataError}
              </div>
            )}

            <div className="card-grid">
              {nextFormationAction ? (
                <button type="button" className="card-button" onClick={handleOpenFormationAction}>
                  <h4 className="card-title">Formation</h4>
                  <p className="card-text">Leçon suivante : {nextFormationAction.lesson.title}</p>
                </button>
              ) : (
                <article className="card" style={{ opacity: 0.72 }}>
                  <h4 className="card-title">Formation</h4>
                  <p className="card-text">Aucune leçon à reprendre.</p>
                </article>
              )}

              {nextQuizAction ? (
                <button type="button" className="card-button" onClick={handleOpenQuizAction}>
                  <h4 className="card-title">Quiz</h4>
                  <p className="card-text">Quiz à valider : Module {nextQuizAction.title}</p>
                </button>
              ) : (
                <article className="card" style={{ opacity: 0.72 }}>
                  <h4 className="card-title">Quiz</h4>
                  <p className="card-text">Aucun quiz à valider.</p>
                </article>
              )}

              {nextCoachingSession && isValidHttpUrl(nextCoachingSession.booking_url) ? (
                <a href={nextCoachingSession.booking_url ?? "#"} target="_blank" rel="noreferrer" className="card-button">
                  <h4 className="card-title">Coaching</h4>
                  <p className="card-text">
                    {parseDate(nextCoachingSession.scheduled_at) !== null ? "Séance à replanifier" : "Séance à réserver"} : {nextCoachingSession.theme ?? "Séance sans thème"}
                  </p>
                </a>
              ) : (
                <article className="card" style={{ opacity: 0.72 }}>
                  <h4 className="card-title">Coaching</h4>
                  <p className="card-text">Aucun coaching prévu.</p>
                </article>
              )}
            </div>
          </div>

          <div className="section-block">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 className="subsection-title" style={{ margin: 0 }}>
                Prochaines séances
              </h3>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSessionsModalTab("upcoming");
                  setShowAllSessionsModal(true);
                }}
                disabled={sessions.length === 0}
              >
                Voir toutes les séances
              </button>
            </div>
            {sessionsLoadError && <div className="error-box">{sessionsLoadError}</div>}
            {!sessionsLoadError && upcomingSessions.length === 0 && <div className="empty-state">Aucune séance à venir.</div>}

            {!sessionsLoadError && upcomingSessions.length > 0 && (
              <div className="card-grid">
                {upcomingSessions.map((session) => {
                  const formattedDate = formatDate(session.scheduled_at);
                  return (
                    <article key={session.id} className="card">
                      {formattedDate && <p className="card-meta">{formattedDate}</p>}
                      <h4 className="card-title">{session.theme ?? "Séance sans thème"}</h4>
                      <p className="card-text clamp-2">{session.objective ?? "Objectif non renseigné."}</p>

                      {isValidHttpUrl(session.booking_url) ? (
                        <a href={session.booking_url ?? "#"} target="_blank" rel="noreferrer" className="btn btn-primary card-action">
                          {parseDate(session.scheduled_at) !== null ? "Replanifier" : "Réserver"}
                        </a>
                      ) : (
                        <p className="card-meta card-action">Lien de réservation non disponible</p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <div className="section-block">
            <h3 className="subsection-title">Calendrier coaching</h3>
            <div className="card">
              <p className="card-meta" style={{ marginBottom: 10, textTransform: "capitalize" }}>
                {currentMonthLabel}
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
                {weekdayLabels.map((label) => (
                  <p key={label} className="card-meta" style={{ margin: 0, textAlign: "center", fontSize: "0.78rem" }}>
                    {label}
                  </p>
                ))}

                {calendarCells.map((cell, index) => {
                  if (cell.kind === "empty") {
                    return <div key={`empty-${index}`} style={{ minHeight: 34 }} />;
                  }

                  const isToday =
                    cell.day === nowDate.getDate() &&
                    currentMonthStart.getMonth() === nowDate.getMonth() &&
                    currentMonthStart.getFullYear() === nowDate.getFullYear();
                  const isSelected = selectedCalendarDateKey === cell.dateKey;

                  return (
                    <button
                      key={cell.dateKey}
                      type="button"
                      onClick={() => {
                        if (!cell.hasSessions) {
                          return;
                        }
                        setSelectedCalendarDateKey(cell.dateKey);
                      }}
                      disabled={!cell.hasSessions}
                      aria-label={cell.hasSessions ? `Voir les séances du ${cell.day}` : `Aucune séance le ${cell.day}`}
                      style={{
                        minHeight: 34,
                        borderRadius: 8,
                        border: `1px solid ${isSelected ? "#111827" : cell.hasSessions ? "#94a3b8" : "#e5e7eb"}`,
                        background: isSelected ? "#111827" : cell.hasSessions ? "#f8fafc" : "#ffffff",
                        color: isSelected ? "#ffffff" : "#111827",
                        cursor: cell.hasSessions ? "pointer" : "default",
                        fontWeight: isToday ? 700 : 500,
                      }}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>

              {sessionsCountInCurrentMonth === 0 && (
                <p className="card-meta" style={{ marginTop: 10 }}>
                  Aucune séance prévue ce mois-ci.
                </p>
              )}
            </div>
          </div>

          <div className="section-block">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 className="subsection-title" style={{ margin: 0 }}>
                Mes tâches
              </h3>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setTasksModalTab("todo");
                  setShowAllTasksModal(true);
                }}
                disabled={tasks.length === 0}
              >
                Voir toutes les tâches
              </button>
            </div>
            {tasksLoadError && <div className="error-box">{tasksLoadError}</div>}
            <TasksWidget />
          </div>

          <div className="section-block">
            <h3 className="subsection-title">Ma formation</h3>

            {formationError && <div className="error-box">{formationError}</div>}
            {!formationError && modules.length === 0 && <div className="empty-state">Aucun module disponible.</div>}

            {!formationError && modules.length > 0 && (
              <div className="card-grid">
                {modulesSorted.map((module) => {
                  const isUnlocked = unlockedByModuleId[module.id] === true;
                  const lessonCount = moduleLessons.filter((lesson) => lesson.module_id === module.id).length;

                  return (
                    <button
                      key={module.id}
                      type="button"
                      className="card-button"
                      onClick={() => openModule(module)}
                      aria-label={`Ouvrir le module ${module.title}`}
                      disabled={!isUnlocked}
                      style={!isUnlocked ? { opacity: 0.7, cursor: "not-allowed" } : undefined}
                    >
                      <p className="card-meta">Module {module.order_index}</p>
                      <h4 className="card-title">{module.title}</h4>
                      <p className="card-text clamp-2">{module.description ?? "Aucune description."}</p>
                      <p className="card-meta" style={{ marginTop: 10 }}>
                        {lessonCount} leçon(s)
                      </p>
                      {!isUnlocked && (
                        <p className="card-meta" style={{ marginTop: 8, color: "#991b1b" }}>
                          Verrouillé — valide le quiz du module précédent
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {showBadgesModal && (
        <div className="modal-backdrop" onClick={() => setShowBadgesModal(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()} style={{ width: "min(820px, 100%)", maxHeight: "85vh" }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Tous mes badges</h3>
              </div>
              <button type="button" className="btn" onClick={() => setShowBadgesModal(false)}>
                Fermer
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, overflowY: "auto", maxHeight: "65vh" }}>
              {badges.map((badge) => (
                <article key={badge.id} className="card" style={badge.unlocked ? undefined : { opacity: 0.6 }}>
                  <p className="card-meta">{badge.unlocked ? "Débloqué" : "À débloquer"}</p>
                  <h4 className="card-title">{badge.name}</h4>
                  <p className="card-text">{badge.conditionText}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {showAllSessionsModal && (
        <div className="modal-backdrop" onClick={() => setShowAllSessionsModal(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()} style={{ width: "min(860px, 100%)", maxHeight: "85vh" }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Toutes les séances</h3>
              </div>
              <button type="button" className="btn" onClick={() => setShowAllSessionsModal(false)}>
                Fermer
              </button>
            </div>

            <div role="tablist" aria-label="Filtre des séances" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setSessionsModalTab("upcoming")}
                aria-pressed={sessionsModalTab === "upcoming"}
                style={sessionsModalTab === "upcoming" ? { background: "#111827", color: "#ffffff", borderColor: "#111827" } : undefined}
              >
                À venir
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setSessionsModalTab("past")}
                aria-pressed={sessionsModalTab === "past"}
                style={sessionsModalTab === "past" ? { background: "#111827", color: "#ffffff", borderColor: "#111827" } : undefined}
              >
                Passées
              </button>
            </div>

            {sessionsLoadError && <div className="error-box">{sessionsLoadError}</div>}

            {!sessionsLoadError && (
              <div style={{ display: "grid", gap: 8, overflowY: "auto", maxHeight: "65vh" }}>
                {(sessionsModalTab === "upcoming" ? upcomingSessionsAll : pastSessionsAll).map((session) => {
                  const formattedDate = formatDate(session.scheduled_at);
                  const isCompleted = session.status?.toLowerCase() === "completed";
                  const canReplan = !isCompleted && isValidHttpUrl(session.booking_url);

                  return (
                    <article key={session.id} className="card">
                      <p className="card-meta">
                        {formattedDate ?? "Date non planifiée"} · {isCompleted ? "Passée" : "À venir"}
                      </p>
                      <h4 className="card-title">{session.theme ?? "Séance sans thème"}</h4>
                      <p className="card-text">{session.objective ?? "Objectif non renseigné."}</p>
                      {canReplan && (
                        <a href={session.booking_url ?? "#"} target="_blank" rel="noreferrer" className="btn btn-primary card-action">
                          Replanifier
                        </a>
                      )}
                    </article>
                  );
                })}

                {(sessionsModalTab === "upcoming" ? upcomingSessionsAll : pastSessionsAll).length === 0 && (
                  <div className="empty-state">
                    {sessionsModalTab === "upcoming" ? "Aucune séance à venir." : "Aucune séance passée."}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showAllTasksModal && (
        <div className="modal-backdrop" onClick={() => setShowAllTasksModal(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()} style={{ width: "min(820px, 100%)", maxHeight: "85vh" }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Toutes les tâches</h3>
              </div>
              <button type="button" className="btn" onClick={() => setShowAllTasksModal(false)}>
                Fermer
              </button>
            </div>

            <div role="tablist" aria-label="Filtre des tâches" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setTasksModalTab("todo")}
                aria-pressed={tasksModalTab === "todo"}
                style={tasksModalTab === "todo" ? { background: "#111827", color: "#ffffff", borderColor: "#111827" } : undefined}
              >
                À faire
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setTasksModalTab("done")}
                aria-pressed={tasksModalTab === "done"}
                style={tasksModalTab === "done" ? { background: "#111827", color: "#ffffff", borderColor: "#111827" } : undefined}
              >
                Terminées
              </button>
            </div>

            {tasksLoadError && <div className="error-box">{tasksLoadError}</div>}

            {!tasksLoadError && (
              <div style={{ display: "grid", gap: 8, overflowY: "auto", maxHeight: "65vh" }}>
                {(tasksModalTab === "todo" ? todoTasks : doneTasks).map((task) => (
                  <article key={task.id} className="card">
                    <p className="card-meta">
                      Échéance: {formatDueDate(task.due_date)}
                      {task.est_minutes ? ` · ${task.est_minutes} min` : ""}
                    </p>
                    <h4 className="card-title">{task.title}</h4>
                    <p className="card-text">
                      {tasksModalTab === "todo" ? getPriorityLabel(task.priority) : "Terminée"}
                    </p>
                  </article>
                ))}

                {(tasksModalTab === "todo" ? todoTasks : doneTasks).length === 0 && (
                  <div className="empty-state">
                    {tasksModalTab === "todo" ? "Aucune tâche à faire." : "Aucune tâche terminée."}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeModule && (
        <div className="modal-backdrop" onClick={closeModuleModal}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="card-meta">Module</p>
                <h3 className="modal-title">{activeModule.title}</h3>
                {activeModule.description && <p className="card-text">{activeModule.description}</p>}
              </div>
              <button type="button" className="btn" onClick={closeModuleModal}>
                Fermer
              </button>
            </div>

            {!isActiveModuleUnlocked && <div className="empty-state">Verrouillé — valide le quiz du module précédent.</div>}

            {isActiveModuleUnlocked && (
              <>
                <div role="tablist" aria-label="Contenu du module" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setActiveTab("lessons")}
                    aria-pressed={activeTab === "lessons"}
                    style={activeTab === "lessons" ? { background: "#111827", color: "#ffffff", borderColor: "#111827" } : undefined}
                  >
                    Leçons
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setActiveTab("quiz")}
                    aria-pressed={activeTab === "quiz"}
                    style={activeTab === "quiz" ? { background: "#111827", color: "#ffffff", borderColor: "#111827" } : undefined}
                  >
                    Quiz
                  </button>
                </div>

                {activeTab === "lessons" && (
                  <>
                    {activeModuleLessons.length === 0 && <div className="empty-state">Aucune leçon publiée dans ce module.</div>}

                    {activeModuleLessons.length > 0 && (
                      <div style={{ display: "grid", gap: 8 }}>
                        {activeModuleLessons.map((lesson) => {
                          const isActive = activeLesson?.id === lesson.id;

                          return (
                            <button
                              key={lesson.id}
                              type="button"
                              className="card-button"
                              onClick={() => setActiveLessonId(lesson.id)}
                              style={isActive ? { borderColor: "#111827" } : undefined}
                              aria-label={`Ouvrir la leçon ${lesson.title}`}
                            >
                              <h4 className="card-title">{lesson.title}</h4>
                              <p className="card-meta">
                                {getLessonTypeLabel(lesson.content_type)}
                                {lesson.duration_min ? ` · ${lesson.duration_min} min` : ""}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {activeLesson && (
                      <div style={{ marginTop: 14 }}>
                        <h4 className="subsection-title">{activeLesson.title}</h4>

                        {activeLesson.content_type?.toLowerCase() === "video" && (
                          <>
                            {activeLesson.tella_url ? (
                              <div className="modal-video">
                                <iframe
                                  src={activeLesson.tella_url}
                                  title={activeLesson.title}
                                  allow="autoplay; fullscreen; picture-in-picture"
                                  allowFullScreen
                                />
                              </div>
                            ) : (
                              <div className="empty-state">Vidéo indisponible pour cette leçon.</div>
                            )}
                          </>
                        )}

                        {activeLesson.content_type?.toLowerCase() === "lecture" && (
                          <>
                            {activeLesson.content_markdown ? (
                              <p className="card-text" style={{ whiteSpace: "pre-wrap" }}>
                                {activeLesson.content_markdown}
                              </p>
                            ) : (
                              <div className="empty-state">Contenu de lecture indisponible pour cette leçon.</div>
                            )}
                          </>
                        )}

                        <div style={{ marginTop: 14 }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => void markLessonAsCompleted(activeLesson.id)}
                            disabled={isActiveLessonCompleted || lessonProgressSubmittingId === activeLesson.id}
                          >
                            {isActiveLessonCompleted
                              ? "Leçon terminée"
                              : lessonProgressSubmittingId === activeLesson.id
                                ? "Enregistrement..."
                                : "Marquer comme terminée"}
                          </button>

                          {lessonProgressMessage && (
                            <p
                              className="card-meta"
                              style={{ marginTop: 8, color: lessonProgressMessage === "Leçon terminée." ? "#166534" : "#991b1b" }}
                            >
                              {lessonProgressMessage}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {activeTab === "quiz" && (
                  <>
                    {quizLoading && <p className="muted">Chargement du quiz...</p>}
                    {!quizLoading && quizError && <div className="error-box">Erreur Supabase: {quizError}</div>}
                    {!quizLoading && !quizError && (quizUnavailable || quizQuestions.length === 0) && <div className="empty-state">Quiz non disponible.</div>}

                    {!quizLoading && !quizError && !quizUnavailable && quizQuestions.length > 0 && (
                      <div style={{ display: "grid", gap: 12 }}>
                        {quizQuestions.map((question, questionIndex) => (
                          <div key={question.id} className="card">
                            <p className="card-meta">Question {questionIndex + 1}</p>
                            <p className="card-text">{question.prompt}</p>

                            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                              {(shuffledChoicesByQuestionId[question.id] ?? question.choices).map((choice) => (
                                <label key={choice.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                  <input
                                    type="radio"
                                    name={`question-${question.id}`}
                                    value={choice.id}
                                    checked={selectedAnswers[question.id] === choice.id}
                                    onChange={() => {
                                      setSelectedAnswers((current) => ({ ...current, [question.id]: choice.id }));
                                      if (quizSubmitMessage) {
                                        setQuizSubmitMessage("");
                                      }
                                    }}
                                    disabled={passed === true || quizSubmitting}
                                  />
                                  <span>{choice.label}</span>
                                </label>
                              ))}
                            </div>

                            {question.explanation && passed === true && (
                              <p className="card-meta" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                                Explication: {question.explanation}
                              </p>
                            )}
                          </div>
                        ))}

                        {passed === true && <div className="empty-state">Quiz réussi.</div>}

                        {passed !== true && quizSubmitMessage && (
                          <p className="card-text" style={{ color: "#991b1b", margin: 0 }}>
                            {quizSubmitMessage}
                          </p>
                        )}

                        <div>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => void submitQuiz()}
                            disabled={passed === true || quizSubmitting}
                          >
                            {quizSubmitting ? "Envoi..." : "Soumettre le quiz"}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {selectedCalendarDateKey && (
        <div className="modal-backdrop" onClick={() => setSelectedCalendarDateKey(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()} style={{ width: "min(720px, 100%)", maxHeight: "85vh" }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Séances du {selectedDateReadable}</h3>
              </div>
              <button type="button" className="btn" onClick={() => setSelectedCalendarDateKey(null)}>
                Fermer
              </button>
            </div>

            {selectedDaySessions.length === 0 && <div className="empty-state">Aucune séance ce jour.</div>}

            {selectedDaySessions.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                {selectedDaySessions.map((session) => {
                  const hourLabel = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
                    new Date(parseDate(session.scheduled_at) ?? Date.now())
                  );
                  const statusLabel = session.status?.toLowerCase() === "completed" ? "completed" : "planned";
                  const canReplan = statusLabel === "planned" && isValidHttpUrl(session.booking_url);

                  return (
                    <article key={session.id} className="card">
                      <p className="card-meta">
                        {hourLabel} · {statusLabel}
                      </p>
                      <h4 className="card-title">{session.theme ?? "Séance sans thème"}</h4>

                      {canReplan && (
                        <a href={session.booking_url ?? "#"} target="_blank" rel="noreferrer" className="btn btn-primary card-action">
                          Replanifier
                        </a>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
