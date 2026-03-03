import { useEffect, useRef, useState } from "react";
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
  description?: string | null;
  proof?: string | null;
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

type ModuleFilter = "all" | "todo" | "done";

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
  const normalized = task.status?.toLowerCase();
  return normalized === "done" || normalized === "completed";
}

function normalizeTaskPriority(priority: string | null | undefined) {
  const normalized = priority?.trim().toLowerCase();

  if (normalized === "high" || normalized === "haute") {
    return "high";
  }
  if (normalized === "medium" || normalized === "moyenne") {
    return "medium";
  }
  if (normalized === "low" || normalized === "basse") {
    return "low";
  }

  return "low";
}

function getTaskPriorityLabel(priority: string | null | undefined) {
  const normalized = normalizeTaskPriority(priority);

  if (normalized === "high") {
    return "Haute";
  }
  if (normalized === "medium") {
    return "Moyenne";
  }

  return "Basse";
}

function getTaskPriorityRank(priority: string | null | undefined) {
  const normalized = normalizeTaskPriority(priority);

  if (normalized === "high") {
    return 0;
  }
  if (normalized === "medium") {
    return 1;
  }

  return 2;
}

function getTaskPriorityClass(priority: string | null | undefined) {
  const normalized = normalizeTaskPriority(priority);

  if (normalized === "high") {
    return "tf-taskPriority tf-taskPriority--high";
  }
  if (normalized === "medium") {
    return "tf-taskPriority tf-taskPriority--medium";
  }

  return "tf-taskPriority tf-taskPriority--low";
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
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"lessons" | "quiz">("lessons");
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("all");

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
  const [tasksModalError, setTasksModalError] = useState("");
  const [taskTogglePendingId, setTaskTogglePendingId] = useState<string | null>(null);
  const [showBadgesModal, setShowBadgesModal] = useState(false);
  const [showExpandedContent, setShowExpandedContent] = useState(false);
  const moduleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const didAutoOpen = useRef(false);

  useEffect(() => {
    const selectedModuleId = expandedModuleId;
    if (!selectedModuleId) {
      return;
    }

    moduleRefs.current[selectedModuleId]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [expandedModuleId]);

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

      let tasksData: TaskItem[] | null = null;
      let tasksError: { code?: string; message: string } | null = null;
      const tasksSelectAttempts: Array<{ select: string; defaults: Partial<TaskItem> }> = [
        {
          select: "id,title,priority,due_date,est_minutes,status,updated_at,description,proof",
          defaults: {},
        },
        {
          select: "id,title,priority,due_date,est_minutes,status,description,proof",
          defaults: { updated_at: null },
        },
        {
          select: "id,title,priority,due_date,est_minutes,status,updated_at",
          defaults: { description: null, proof: null },
        },
        {
          select: "id,title,priority,due_date,est_minutes,status",
          defaults: { updated_at: null, description: null, proof: null },
        },
      ];

      for (const attempt of tasksSelectAttempts) {
        const result = await supabase.from("tasks").select(attempt.select);

        if (!result.error) {
          tasksData = ((result.data ?? []) as unknown as TaskItem[]).map((task) => ({
            ...attempt.defaults,
            ...task,
          }));
          tasksError = null;
          break;
        }

        const message = result.error.message.toLowerCase();
        const isMissingOptionalColumn =
          message.includes("updated_at") || message.includes("description") || message.includes("proof");

        if (!isMissingOptionalColumn) {
          tasksError = result.error;
          break;
        }

        tasksError = result.error;
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

  const modulesMeta = modulesSorted.map((module) => {
    const lessonsForModule = moduleLessons
      .filter((lesson) => lesson.module_id === module.id)
      .sort((a, b) => a.order_index - b.order_index);
    const lessonCount = lessonsForModule.length;
    const doneLessons = lessonsForModule.filter((lesson) => completedByLessonId[lesson.id] === true).length;
    const progressPct = lessonCount > 0 ? Math.round((doneLessons / lessonCount) * 100) : 0;
    const isUnlocked = unlockedByModuleId[module.id] === true;
    const moduleHasQuiz = quizRequiredByModuleId[module.id] === true;
    const moduleBadgeLabel = !isUnlocked
      ? "Verrouillé"
      : progressPct === 100 && lessonCount > 0
        ? "Terminé"
        : progressPct > 0
          ? "En cours"
          : "À faire";
    const moduleBadgeClass = !isUnlocked
      ? "tf-moduleBadge tf-moduleBadge--locked"
      : progressPct === 100 && lessonCount > 0
        ? "tf-moduleBadge tf-moduleBadge--done"
        : "tf-moduleBadge tf-moduleBadge--inprogress";
    const ringColor = !isUnlocked
      ? "rgba(255,255,255,.18)"
      : progressPct === 100 && lessonCount > 0
        ? "rgba(40,209,124,.85)"
        : "rgba(175,135,50,.9)";

    return {
      module,
      lessonsForModule,
      lessonCount,
      doneLessons,
      progressPct,
      isUnlocked,
      moduleHasQuiz,
      moduleBadgeLabel,
      moduleBadgeClass,
      ringColor,
    };
  });

  const nextFormationAction = (() => {
    for (const moduleMeta of modulesMeta) {
      if (!moduleMeta.isUnlocked) {
        continue;
      }

      const nextLesson = moduleMeta.lessonsForModule.find((lesson) => completedByLessonId[lesson.id] !== true);
      if (nextLesson) {
        return {
          module: moduleMeta.module,
          lesson: nextLesson,
        };
      }
    }

    return null;
  })();

  const currentModuleId =
    nextFormationAction?.module.id ??
    modulesMeta.find((moduleMeta) => moduleMeta.isUnlocked && moduleMeta.progressPct < 100)?.module.id ??
    null;

  const filteredModules =
    moduleFilter === "done"
      ? modulesMeta.filter((moduleMeta) => moduleMeta.progressPct === 100)
      : moduleFilter === "todo"
        ? currentModuleId
          ? modulesMeta.filter((moduleMeta) => moduleMeta.module.id === currentModuleId)
          : []
        : modulesMeta;

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

  const todoTasks = tasks
    .filter((task) => !isDoneTask(task))
    .sort((a, b) => {
      const priorityDiff = getTaskPriorityRank(a.priority) - getTaskPriorityRank(b.priority);
      if (priorityDiff !== 0) {
        return priorityDiff;
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

      const priorityDiff = getTaskPriorityRank(a.priority) - getTaskPriorityRank(b.priority);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return a.title.localeCompare(b.title, "fr");
    });
  const visibleTasks = tasksModalTab === "todo" ? todoTasks : doneTasks;

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

  const sessionsCountInCurrentMonth = Object.entries(sessionsByDateKey).filter(([dateKey]) => {
    const [yearRaw, monthRaw] = dateKey.split("-");
    return Number(yearRaw) === currentMonthStart.getFullYear() && Number(monthRaw) === currentMonthStart.getMonth() + 1;
  }).length;

  const selectedDaySessions = selectedCalendarDateKey ? sessionsByDateKey[selectedCalendarDateKey] ?? [] : [];
  const selectedDateReadable = selectedCalendarDateKey ? formatDateKeyReadable(selectedCalendarDateKey) : "";

  const activeModuleLessons = activeModule
    ? moduleLessons.filter((lesson) => lesson.module_id === activeModule.id).sort((a, b) => a.order_index - b.order_index)
    : [];
  const activeLesson = activeLessonId ? activeModuleLessons.find((lesson) => lesson.id === activeLessonId) ?? null : null;
  const activeLessonModuleId = moduleLessons.find((lesson) => lesson.id === activeLessonId)?.module_id ?? null;
  const isActiveLessonCompleted = activeLesson ? completedByLessonId[activeLesson.id] === true : false;
  const isActiveModuleUnlocked = activeModule ? unlockedByModuleId[activeModule.id] === true : false;
  const activeStatus = activeModule
    ? !isActiveModuleUnlocked
      ? { label: "Verrouillé", className: "tf-chip" }
      : activeTab === "lessons"
        ? {
            label: isActiveLessonCompleted ? "Terminée" : "À faire",
            className: isActiveLessonCompleted ? "tf-chip tf-chip--done" : "tf-chip",
          }
        : {
            label: passed === true || passedByModuleId[activeModule.id] === true ? "Terminée" : "À faire",
            className:
              passed === true || passedByModuleId[activeModule.id] === true ? "tf-chip tf-chip--done" : "tf-chip",
          }
    : null;
  const canMarkLessonDone = activeTab === "lessons" && !!activeLesson && isActiveModuleUnlocked && !isActiveLessonCompleted;

  function openModule(module: ModuleItem, tab: "lessons" | "quiz" = "lessons", lessonId: string | null = null) {
    if (unlockedByModuleId[module.id] !== true) {
      return;
    }

    setExpandedModuleId(module.id);
    setActiveModule(module);
    if (lessonId !== null) {
      setActiveLessonId(lessonId);
    }
    setActiveTab(tab);
    setLoadedQuizModuleId(null);
    setQuizSubmitMessage("");
  }

  function collapseAllModules() {
    setExpandedModuleId(null);
  }

  function toggleModule(module: ModuleItem) {
    if (unlockedByModuleId[module.id] !== true) {
      return;
    }

    if (expandedModuleId === module.id) {
      collapseAllModules();
      return;
    }

    setExpandedModuleId(module.id);
  }

  function handleOpenFormationAction() {
    if (!nextFormationAction) {
      return;
    }

    openModule(nextFormationAction.module, "lessons", nextFormationAction.lesson.id);
  }

  async function toggleTaskStatus(task: TaskItem) {
    if (taskTogglePendingId === task.id) {
      return;
    }

    const previousTask = { ...task };
    const nextStatus = isDoneTask(task) ? "todo" : "done";

    setTasksModalError("");
    setTaskTogglePendingId(task.id);
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              status: nextStatus,
              updated_at: new Date().toISOString(),
            }
          : item
      )
    );

    const { error: updateError } = await supabase.from("tasks").update({ status: nextStatus }).eq("id", task.id);

    if (updateError) {
      setTasks((current) => current.map((item) => (item.id === task.id ? previousTask : item)));
      setTasksModalError(`Impossible de mettre à jour la tâche : ${updateError.message}`);
    }

    setTaskTogglePendingId((current) => (current === task.id ? null : current));
  }

  useEffect(() => {
    if (didAutoOpen.current) {
      return;
    }

    if (loading || modulesSorted.length === 0) {
      return;
    }

    if (activeModule) {
      didAutoOpen.current = true;
      return;
    }

    const targetModule =
      nextFormationAction?.module ??
      modulesSorted.find(
        (module) => unlockedByModuleId[module.id] === true && passedByModuleId[module.id] !== true
      ) ??
      modulesSorted.find((module) => unlockedByModuleId[module.id] === true) ??
      null;

    if (targetModule) {
      setExpandedModuleId(targetModule.id);
    }

    didAutoOpen.current = true;
  }, [activeModule, loading, modulesSorted, nextFormationAction, passedByModuleId]);

  useEffect(() => {
    if (moduleFilter !== "todo" || !currentModuleId || expandedModuleId === currentModuleId) {
      return;
    }

    setExpandedModuleId(currentModuleId);
  }, [currentModuleId, expandedModuleId, moduleFilter]);

  function renderActivePanelBody() {
    if (!activeModule) {
      return (
        <div className="empty-state">
          Choisis un module à gauche ou utilise Start pour ouvrir ta prochaine leçon.
        </div>
      );
    }

    if (!isActiveModuleUnlocked) {
      return <div className="empty-state">Verrouillé — valide le quiz du module précédent.</div>;
    }

    if (activeTab === "lessons" && !activeLesson) {
      return <div className="empty-state">Choisis une leçon dans la liste de gauche.</div>;
    }

    if (activeTab === "lessons" && activeLesson) {
      return (
        <div className="tf-paneStack">
          {lessonProgressMessage && lessonProgressMessage !== "Leçon terminée." && (
            <p className="card-meta" style={{ color: "#991b1b" }}>
              {lessonProgressMessage}
            </p>
          )}

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
        </div>
      );
    }

    return (
      <>
        {quizLoading && <p className="muted">Chargement du quiz...</p>}
        {!quizLoading && quizError && <div className="error-box">Erreur Supabase: {quizError}</div>}
        {!quizLoading && !quizError && (quizUnavailable || quizQuestions.length === 0) && <div className="empty-state">Quiz non disponible.</div>}

        {!quizLoading && !quizError && !quizUnavailable && quizQuestions.length > 0 && (
          <div style={{ display: "grid", gap: 12 }}>
            {quizQuestions.map((question, questionIndex) => (
              <div key={question.id} className="card tf-card">
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
    );
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
    <>
      {error && <div className="error-box">{error}</div>}
      {loading && <p className="muted tf-muted">Chargement...</p>}

      {!loading && (
        <section className="tf-dashboard">
          <aside className="tf-sidebar tf-card tf-card--flat">
            <span className="tf-chip tf-chip--accent">TF</span>
            <span className="tf-chip" aria-hidden="true">◻</span>
            <span className="tf-chip" aria-hidden="true">◯</span>
            <div style={{ marginTop: "auto" }}>
              <span className="tf-chip">1</span>
            </div>
          </aside>

          <main className="tf-dashboardMain">
            <div className="tf-topRow">
              <div className="tf-card tf-card--flat tf-academyCard">
                <span className="tf-quickIcon" aria-hidden="true">◈</span>
                <div className="tf-quickText">
                  <div className="tf-quickTitle">Académie</div>
                  <div className="tf-quickMeta">Accompagnement</div>
                </div>
                <span className="tf-academyCaret" aria-hidden="true">⌄</span>
              </div>

              <div className="tf-quickActions">
                <button
                  type="button"
                  className="card-button tf-card tf-quickCard tf-startCta"
                  onClick={handleOpenFormationAction}
                  disabled={!nextFormationAction}
                >
                  <span className="tf-quickIcon" aria-hidden="true">▶</span>
                  <div className="tf-quickText">
                    <div className="tf-quickTitle">Start</div>
                    <div className="tf-quickMeta">{nextFormationAction ? "Reprendre la prochaine leçon" : "Choisis un module"}</div>
                  </div>
                </button>
                <button
                  type="button"
                  className="card-button tf-card tf-quickCard"
                  onClick={() => {
                    setTasksModalError("");
                    setTasksModalTab("todo");
                    setShowAllTasksModal(true);
                  }}
                  disabled={tasks.length === 0}
                >
                  <span className="tf-quickIcon" aria-hidden="true">◌</span>
                  <div className="tf-quickText">
                    <div className="tf-quickTitle">Mes tâches</div>
                    <div className="tf-quickMeta">{todoTasks.length} à faire</div>
                  </div>
                </button>
                <button
                  type="button"
                  className="card-button tf-card tf-quickCard"
                  onClick={() => {
                    const firstDateValue = upcomingSessionsAll[0]?.scheduled_at ?? pastSessionsAll[0]?.scheduled_at ?? null;
                    const timestamp = parseDate(firstDateValue);
                    if (timestamp !== null) {
                      setSelectedCalendarDateKey(toLocalDateKey(new Date(timestamp)));
                    }
                  }}
                  disabled={upcomingSessionsAll.length + pastSessionsAll.length === 0}
                >
                  <span className="tf-quickIcon" aria-hidden="true">◷</span>
                  <div className="tf-quickText">
                    <div className="tf-quickTitle">Calendrier</div>
                    <div className="tf-quickMeta">{sessionsCountInCurrentMonth} jour(x) ce mois-ci</div>
                  </div>
                </button>
                <button
                  type="button"
                  className="card-button tf-card tf-quickCard"
                  onClick={() => setShowBadgesModal(true)}
                >
                  <span className="tf-quickIcon" aria-hidden="true">◍</span>
                  <div className="tf-quickText">
                    <div className="tf-quickTitle">Profil</div>
                    <div className="tf-quickMeta">{currentBadge ? currentBadge.name : "Aucun badge"}</div>
                  </div>
                </button>
              </div>
            </div>

            <div className="tf-contentRow">
              <section className="tf-leftPane" style={{ padding: 14 }}>
                <div className="tf-cardHeader" style={{ alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div className="tf-tabs" style={{ flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={`tf-tab${moduleFilter === "all" ? " isActive" : ""}`}
                        onClick={() => setModuleFilter("all")}
                      >
                        Tous
                      </button>
                      <button
                        type="button"
                        className={`tf-tab${moduleFilter === "todo" ? " isActive" : ""}`}
                        onClick={() => setModuleFilter("todo")}
                      >
                        À faire
                      </button>
                      <button
                        type="button"
                        className={`tf-tab${moduleFilter === "done" ? " isActive" : ""}`}
                        onClick={() => setModuleFilter("done")}
                      >
                        Fait
                      </button>
                    </div>
                  </div>
                  {badgeLoadError && (
                    <span className="card-meta" style={{ color: "#991b1b" }}>
                      {badgeLoadError}
                    </span>
                  )}
                </div>

                {formationError && <div className="error-box">{formationError}</div>}

                <div className="tf-scroll">
                  <div className="tf-paneStack">
                    {!formationError && modulesMeta.length === 0 && <div className="empty-state">Aucun module disponible.</div>}

                    {!formationError && modulesMeta.length > 0 && filteredModules.length === 0 && (
                      <div className="empty-state">
                        {moduleFilter === "done"
                          ? "Aucun module terminé."
                          : moduleFilter === "todo"
                            ? "Aucun module à faire."
                            : "Aucun module disponible."}
                      </div>
                    )}

                    {!formationError &&
                      filteredModules.length > 0 &&
                      filteredModules.map((moduleMeta) => {
                        const {
                          module,
                          lessonsForModule,
                          progressPct,
                          isUnlocked,
                          moduleHasQuiz,
                          moduleBadgeLabel,
                          moduleBadgeClass,
                          ringColor,
                        } = moduleMeta;
                        const isSelected = expandedModuleId === module.id;
                        const quizState =
                          passedByModuleId[module.id] === true
                            ? "passed"
                            : activeModule?.id === module.id &&
                                activeTab === "quiz" &&
                                quizSubmitMessage === "Certaines réponses sont incorrectes. Réessaie."
                              ? "failed"
                              : "todo";

                        return (
                          <div key={module.id} ref={(element) => { moduleRefs.current[module.id] = element; }} className="tf-moduleCard">
                            <button
                              type="button"
                              className={`card-button tf-card tf-moduleCardFixed${module.id === activeLessonModuleId ? " tf-moduleCard--active" : ""}`}
                              onClick={() => toggleModule(module)}
                              aria-label={`Ouvrir le module ${module.title}`}
                              aria-expanded={isSelected}
                              disabled={!isUnlocked}
                              style={!isUnlocked ? { opacity: 0.7, cursor: "not-allowed" } : undefined}
                            >
                              <div className="tf-moduleTop">
                                <div className="tf-moduleTitleBlock">
                                  <h4 className="tf-moduleTitle tf-clamp2">{module.title}</h4>
                                  <span className={`${moduleBadgeClass} tf-moduleBadge--small`}>{moduleBadgeLabel}</span>
                                </div>
                                <div
                                  className="tf-moduleRing"
                                  aria-label={`Progression ${progressPct}%`}
                                  style={{ background: `conic-gradient(${ringColor} ${progressPct}%, rgba(255,255,255,.10) 0)` }}
                                >
                                  <span>{progressPct}%</span>
                                </div>
                              </div>
                            </button>

                            {isSelected && (
                              <div className="tf-moduleExpand" onClick={(event) => event.stopPropagation()}>
                                <div className="tf-lessonTree">
                                  {lessonsForModule.length === 0 && <div className="empty-state">Aucune leçon publiée dans ce module.</div>}

                                  {lessonsForModule.map((lesson) => {
                                    const isLessonSelected = activeLesson?.id === lesson.id;
                                    const isCompleted = completedByLessonId[lesson.id] === true;

                                    return (
                                      <div
                                        key={lesson.id}
                                        className={`tf-lessonRow${isCompleted ? " tf-lessonRow--done" : ""}`}
                                        style={isLessonSelected ? { borderColor: "#AF8732" } : undefined}
                                      >
                                        <button
                                          type="button"
                                          className="tf-lessonLeft"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            openModule(module, "lessons", lesson.id);
                                          }}
                                          aria-label={`Ouvrir la leçon ${lesson.title}`}
                                        >
                                          <span className="tf-lessonIcon" aria-hidden="true">
                                            {lesson.content_type?.toLowerCase() === "video" ? "▶" : "≡"}
                                          </span>
                                          <span style={{ minWidth: 0 }}>
                                            <span className="tf-lessonTitle">{lesson.title}</span>
                                            <span className="tf-lessonMeta">
                                              {getLessonTypeLabel(lesson.content_type)}
                                              {lesson.duration_min ? ` · ${lesson.duration_min} min` : ""}
                                            </span>
                                          </span>
                                        </button>
                                        <button
                                          type="button"
                                          className="tf-lessonToggle"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            openModule(module, "lessons", lesson.id);
                                          }}
                                          aria-label={isCompleted ? `Leçon ${lesson.title} terminée` : `Ouvrir la leçon ${lesson.title}`}
                                        >
                                          {isCompleted ? "✓" : ""}
                                        </button>
                                      </div>
                                    );
                                  })}

                                  {moduleHasQuiz && (
                                    <button
                                      type="button"
                                      className={`tf-quizRow${quizState === "passed" ? " tf-quizRow--passed" : ""}${quizState === "failed" ? " tf-quizRow--failed" : ""}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openModule(module, "quiz", null);
                                      }}
                                    >
                                      {quizState === "passed" ? "Quiz validé" : quizState === "failed" ? "Quiz échoué" : "Quiz à faire"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </section>

              <section className="tf-centerPane tf-card" style={{ padding: 14 }}>
                {quizDataError && <div className="error-box">{quizDataError}</div>}

                <div className="tf-scroll">
                  <div className="tf-paneStack">
                    {activeModule && (
                      <>
                        <div className="tf-contentHeader">
                          <div className="tf-titleRow">
                            <h2 className="tf-contentTitle tf-title">{activeLesson ? activeLesson.title : (activeModule?.title ?? "")}</h2>
                            <div className="tf-titleActions">
                              {activeTab === "lessons" && activeLesson && (
                                <span className="card-meta" style={{ whiteSpace: "nowrap" }}>
                                  {getLessonTypeLabel(activeLesson.content_type)}
                                  {activeLesson.duration_min ? ` · ${activeLesson.duration_min} min` : ""}
                                </span>
                              )}
                              {canMarkLessonDone && activeLesson ? (
                                <button
                                  type="button"
                                  className="tf-btn tf-btn--accent tf-primaryBtn--compact"
                                  onClick={() => void markLessonAsCompleted(activeLesson.id)}
                                  disabled={lessonProgressSubmittingId === activeLesson.id}
                                >
                                  {lessonProgressSubmittingId === activeLesson.id ? "Enregistrement..." : "Marquer comme terminée"}
                                </button>
                              ) : (
                                activeStatus && <span className={activeStatus.className}>{activeStatus.label}</span>
                              )}
                              <button
                                type="button"
                                className="tf-actionPill"
                                onClick={() => setShowExpandedContent(true)}
                                aria-label="Ouvrir le contenu en grand"
                                title="Ouvrir en grand"
                              >
                                ⤢
                              </button>
                            </div>
                          </div>
                          {activeModule.description && <p className="tf-contentSubtitle">{activeModule.description}</p>}
                        </div>
                      </>
                    )}

                    {renderActivePanelBody()}
                  </div>
                </div>
              </section>
            </div>
          </main>
        </section>
      )}

      {showExpandedContent && activeModule && (
        <div className="modal-backdrop tf-modalBackdrop" onClick={() => setShowExpandedContent(false)}>
          <div
            className="modal-panel tf-modalPanel tf-card"
            onClick={(event) => event.stopPropagation()}
            style={{ width: "min(1180px, 100%)", maxHeight: "90vh" }}
          >
            <div className="modal-header">
              <div>
                <p className="card-meta tf-chip tf-chip--accent">Module</p>
                <h3 className="modal-title tf-title">{activeModule.title}</h3>
                {activeModule.description && <p className="tf-contentSubtitle">{activeModule.description}</p>}
              </div>
              <div className="tf-paneActions" style={{ alignItems: "center", flexWrap: "wrap" }}>
                {activeStatus && <span className={activeStatus.className}>{activeStatus.label}</span>}
                <button type="button" className="btn" onClick={() => setShowExpandedContent(false)}>
                  Fermer
                </button>
              </div>
            </div>

            <div className="tf-scroll" style={{ maxHeight: "calc(90vh - 180px)" }}>
              <div className="tf-paneStack">{renderActivePanelBody()}</div>
            </div>
          </div>
        </div>
      )}

      {showBadgesModal && (
        <div className="modal-backdrop tf-modalBackdrop" onClick={() => setShowBadgesModal(false)}>
          <div className="modal-panel tf-modalPanel tf-card" onClick={(event) => event.stopPropagation()} style={{ width: "min(820px, 100%)", maxHeight: "85vh" }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title tf-title">Tous mes badges</h3>
              </div>
              <button type="button" className="btn" onClick={() => setShowBadgesModal(false)}>
                Fermer
              </button>
            </div>

            <div className="tf-scroll" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, maxHeight: "65vh" }}>
              {badges.map((badge) => (
                <article key={badge.id} className="card tf-card" style={badge.unlocked ? undefined : { opacity: 0.6 }}>
                  <p className="card-meta tf-chip">{badge.unlocked ? "Débloqué" : "À débloquer"}</p>
                  <h4 className="card-title tf-title">{badge.name}</h4>
                  <p className="card-text">{badge.conditionText}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {showAllSessionsModal && (
        <div className="modal-backdrop tf-modalBackdrop" onClick={() => setShowAllSessionsModal(false)}>
          <div className="modal-panel tf-modalPanel tf-card" onClick={(event) => event.stopPropagation()} style={{ width: "min(860px, 100%)", maxHeight: "85vh" }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title tf-title">Toutes les séances</h3>
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
              <div className="tf-scroll" style={{ display: "grid", gap: 8, maxHeight: "65vh" }}>
                {(sessionsModalTab === "upcoming" ? upcomingSessionsAll : pastSessionsAll).map((session) => {
                  const formattedDate = formatDate(session.scheduled_at);
                  const isCompleted = session.status?.toLowerCase() === "completed";
                  const canReplan = !isCompleted && isValidHttpUrl(session.booking_url);

                  return (
                    <article key={session.id} className="card tf-card">
                      <p className="card-meta">
                        {formattedDate ?? "Date non planifiée"} · {isCompleted ? "Passée" : "À venir"}
                      </p>
                      <h4 className="card-title tf-title">{session.theme ?? "Séance sans thème"}</h4>
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
        <div className="modal-backdrop tf-modalBackdrop" onClick={() => setShowAllTasksModal(false)}>
          <div className="modal-panel tf-modalPanel tf-card" onClick={(event) => event.stopPropagation()} style={{ width: "min(820px, 100%)", maxHeight: "85vh" }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title tf-title">Mes tâches</h3>
              </div>
              <button type="button" className="btn" aria-label="Fermer" onClick={() => setShowAllTasksModal(false)}>
                ×
              </button>
            </div>

            <div className="tf-tasksTabs" role="tablist" aria-label="Filtre des tâches">
              <button
                type="button"
                className={`tf-tasksTab${tasksModalTab === "todo" ? " tf-tasksTab--active" : ""}`}
                onClick={() => setTasksModalTab("todo")}
                aria-pressed={tasksModalTab === "todo"}
              >
                À faire ({todoTasks.length})
              </button>
              <button
                type="button"
                className={`tf-tasksTab${tasksModalTab === "done" ? " tf-tasksTab--active" : ""}`}
                onClick={() => setTasksModalTab("done")}
                aria-pressed={tasksModalTab === "done"}
              >
                Terminées ({doneTasks.length})
              </button>
            </div>

            {tasksLoadError && <div className="error-box">{tasksLoadError}</div>}
            {!tasksLoadError && tasksModalError && <div className="error-box">{tasksModalError}</div>}

            {!tasksLoadError && (
              <div className="tf-scroll" style={{ display: "grid", gap: 8, maxHeight: "65vh" }}>
                {visibleTasks.map((task) => {
                  const taskDescription = task.description ?? task.proof ?? "";
                  const isCompleted = isDoneTask(task);

                  return (
                    <article key={task.id} className="tf-taskItem">
                      <button
                        type="button"
                        className={`tf-taskCheckbox${isCompleted ? " isChecked" : ""}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void toggleTaskStatus(task);
                        }}
                        aria-label={isCompleted ? `Marquer ${task.title} comme à faire` : `Marquer ${task.title} comme terminée`}
                        aria-pressed={isCompleted}
                        disabled={taskTogglePendingId === task.id}
                      >
                        {isCompleted ? "✓" : ""}
                      </button>

                      <div style={{ minWidth: 0, display: "grid", gap: 6, flex: 1 }}>
                        <h4 className="card-title tf-title" style={{ fontSize: 18 }}>
                          {task.title}
                        </h4>
                        {taskDescription && (
                          <p className="card-text" style={{ margin: 0 }}>
                            {taskDescription}
                          </p>
                        )}
                      </div>

                      <span className={getTaskPriorityClass(task.priority)}>{getTaskPriorityLabel(task.priority)}</span>
                    </article>
                  );
                })}

                {visibleTasks.length === 0 && (
                  <div className="empty-state">
                    {tasksModalTab === "todo" ? "Aucune tâche à faire." : "Aucune tâche terminée."}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedCalendarDateKey && (
        <div className="modal-backdrop tf-modalBackdrop" onClick={() => setSelectedCalendarDateKey(null)}>
          <div className="modal-panel tf-modalPanel tf-card" onClick={(event) => event.stopPropagation()} style={{ width: "min(720px, 100%)", maxHeight: "85vh" }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title tf-title">Séances du {selectedDateReadable}</h3>
              </div>
              <button type="button" className="btn" onClick={() => setSelectedCalendarDateKey(null)}>
                Fermer
              </button>
            </div>

            {selectedDaySessions.length === 0 && <div className="empty-state">Aucune séance ce jour.</div>}

            {selectedDaySessions.length > 0 && (
              <div className="tf-scroll" style={{ display: "grid", gap: 8 }}>
                {selectedDaySessions.map((session) => {
                  const hourLabel = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
                    new Date(parseDate(session.scheduled_at) ?? Date.now())
                  );
                  const statusLabel = session.status?.toLowerCase() === "completed" ? "completed" : "planned";
                  const canReplan = statusLabel === "planned" && isValidHttpUrl(session.booking_url);

                  return (
                    <article key={session.id} className="card tf-card">
                      <p className="card-meta">
                        {hourLabel} · {statusLabel}
                      </p>
                      <h4 className="card-title tf-title">{session.theme ?? "Séance sans thème"}</h4>

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
    </>
  );
}
