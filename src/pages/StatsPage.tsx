import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  user_id: string | null;
  status: string | null;
  order_index: number | null;
  created_at: string | null;
  theme: string | null;
  objective: string | null;
  booking_url: string | null;
  scheduled_at: string | null;
  summary: string | null;
  recording_url: string | null;
  transcript: string | null;
};

type CalendarSessionItem = {
  id: string;
  status: string | null;
  scheduled_at: string | null;
  theme: string | null;
  booking_url: string | null;
};

type CalendlyUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

type ProfileEngagement = {
  xp: number;
  streak_current: number;
  streak_best: number;
  cadence_target: number;
  cadence_unit: "day" | "week";
  period_progress: number;
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
type SessionUiState = "to_schedule" | "scheduled" | "awaiting_validation" | "done";
type PersistedStatsState = {
  viewMode?: "accompagnement" | "coaching";
  coachTimeFilter?: "all" | "upcoming" | "past";
  coachTopicFilter?: "with" | "without";
  selectedSessionId?: string | null;
  activeLessonId?: string | null;
  activeModuleId?: string | null;
  expandedModuleId?: string | null;
  activeTab?: "lessons" | "quiz";
  moduleFilter?: ModuleFilter;
};

const CALENDLY_FREE_FALLBACK_URL =
  (import.meta.env.VITE_CALENDLY_FREE_URL ?? "").trim() ||
  "https://calendly.com/trustfinanceam/reserve-ton-appel-avec-matheo-aalberg-clone";
const SUBJECT_BOOKING_URLS: Record<string, string | undefined> = {
  "Présentation de l’accompagnement & Bilan initial.": import.meta.env.VITE_CALENDLY_SUBJECT_1_URL,
  "Optimisation et structuration bancaire.": import.meta.env.VITE_CALENDLY_SUBJECT_2_URL,
  "Les bases fondamentales de l’investissement.": import.meta.env.VITE_CALENDLY_SUBJECT_3_URL,
  "Structurer son investissement intelligemment.": import.meta.env.VITE_CALENDLY_SUBJECT_4_URL,
  "Comprendre les marchés financiers et le système bancaire.": import.meta.env.VITE_CALENDLY_SUBJECT_5_URL,
};
const STORAGE_KEY = "tf:statsState";

const COACH_THEME_ORDER = [
  "Présentation de l’accompagnement & Bilan initial.",
  "Optimisation et structuration bancaire.",
  "Les bases fondamentales de l’investissement.",
  "Structurer son investissement intelligemment.",
  "Comprendre les marchés financiers et le système bancaire.",
] as const;

const EMPTY_PROFILE_ENGAGEMENT: ProfileEngagement = {
  xp: 0,
  streak_current: 0,
  streak_best: 0,
  cadence_target: 1,
  cadence_unit: "week",
  period_progress: 0,
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

function getSessionUiState(session: Pick<SessionItem, "status" | "scheduled_at">): SessionUiState {
  if (session.status?.toLowerCase() === "completed") {
    return "done";
  }

  if (!session.scheduled_at) {
    return "to_schedule";
  }

  const sessionTimestamp = new Date(session.scheduled_at).getTime();
  return sessionTimestamp < Date.now() ? "awaiting_validation" : "scheduled";
}

function isDoneTask(task: TaskItem) {
  const normalized = task.status?.toLowerCase();
  return normalized === "done" || normalized === "completed";
}

function isLessonDone(progress?: { status?: string | null; done_at?: string | null }) {
  const normalizedStatus = (progress?.status ?? "").toLowerCase();
  return normalizedStatus === "done" || normalizedStatus === "completed" || Boolean(progress?.done_at);
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

function buildCalendlyUrl(baseUrl: string, user: CalendlyUser | null) {
  try {
    const url = new URL(baseUrl);

    if (!user?.id) {
      return url.toString();
    }

    if (user.email) {
      url.searchParams.set("email", user.email);
    }

    const metadata = user.user_metadata ?? {};
    const fullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
    const name = typeof metadata.name === "string" ? metadata.name.trim() : "";
    const resolvedName = fullName || name;

    if (resolvedName) {
      url.searchParams.set("name", resolvedName);
    }

    url.searchParams.set("a1", user.id);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

function getBaseBookingUrl(theme: string | null) {
  const normalizedTheme = (theme ?? "").trim();
  if (!normalizedTheme) {
    return CALENDLY_FREE_FALLBACK_URL;
  }

  const mapped = SUBJECT_BOOKING_URLS[normalizedTheme]?.trim();
  return mapped || CALENDLY_FREE_FALLBACK_URL;
}

function resolveSessionBookingUrl(
  session: Pick<SessionItem, "status" | "scheduled_at" | "theme" | "booking_url"> | null | undefined
) {
  if (!session) {
    return null;
  }

  const isPlanned = session.status?.toLowerCase() === "planned";
  const isUnscheduled = parseDate(session.scheduled_at) === null;
  if (isPlanned && isUnscheduled) {
    return getBaseBookingUrl(session.theme);
  }

  return session.booking_url;
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

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getNextMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function formatMonthTitle(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function pickWithTopicSessionId(sessions: SessionItem[]) {
  const themedSessions = sessions.filter((session) => !!session.theme?.trim());

  for (const theme of COACH_THEME_ORDER) {
    const nextToPlan = themedSessions.find(
      (session) => session.theme === theme && session.status?.toLowerCase() === "planned" && session.scheduled_at === null
    );

    if (nextToPlan) {
      return nextToPlan.id;
    }
  }

  for (const theme of COACH_THEME_ORDER) {
    const firstByTheme = themedSessions.find((session) => session.theme === theme);
    if (firstByTheme) {
      return firstByTheme.id;
    }
  }

  return themedSessions[0]?.id ?? null;
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

function isMissingEngagementEventsTable(error: { code?: string; message: string }) {
  const message = error.message.toLowerCase();
  return error.code === "42P01" || (message.includes("does not exist") && message.includes("engagement_events"));
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
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CalendlyUser | null>(null);

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
  const [viewMode, setViewMode] = useState<"accompagnement" | "coaching">("accompagnement");
  const [coachTopicFilter, setCoachTopicFilter] = useState<"with" | "without">("with");
  const [coachTimeFilter, setCoachTimeFilter] = useState<"all" | "upcoming" | "past">("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [needsAutoSelectLesson, setNeedsAutoSelectLesson] = useState(false);
  const [pendingCoachingSelect, setPendingCoachingSelect] = useState(false);
  const [showViewModeMenu, setShowViewModeMenu] = useState(false);
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
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonthDate, setCalendarMonthDate] = useState<Date>(() => getMonthStart(new Date()));
  const [calendarSessions, setCalendarSessions] = useState<CalendarSessionItem[]>([]);
  const [calendarLoginDays, setCalendarLoginDays] = useState<string[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [selectedCalendarDateKey, setSelectedCalendarDateKey] = useState<string | null>(null);
  const [showAllSessionsModal, setShowAllSessionsModal] = useState(false);
  const [sessionsModalTab, setSessionsModalTab] = useState<"upcoming" | "past">("upcoming");
  const [showAllTasksModal, setShowAllTasksModal] = useState(false);
  const [tasksModalTab, setTasksModalTab] = useState<"todo" | "done">("todo");
  const [tasksModalError, setTasksModalError] = useState("");
  const [taskTogglePendingId, setTaskTogglePendingId] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showExpandedContent, setShowExpandedContent] = useState(false);
  const [showPilotageSoon, setShowPilotageSoon] = useState(false);
  const [profileEngagement, setProfileEngagement] = useState<ProfileEngagement>(EMPTY_PROFILE_ENGAGEMENT);
  const [isAdmin, setIsAdmin] = useState(false);
  const [restoredActiveModuleId, setRestoredActiveModuleId] = useState<string | null>(null);
  const [hasLoadedStoredState, setHasLoadedStoredState] = useState(false);
  const moduleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const didAutoOpen = useRef(false);

  const fetchSessions = useCallback(
    async (targetUserId: string | null, shouldApply: () => boolean = () => true) => {
      if (!targetUserId || !shouldApply()) {
        return;
      }

      const primarySelect =
        "id,user_id,status,order_index,created_at,theme,objective,booking_url,scheduled_at,summary,recording_url,transcript";
      const fallbackSelect = "id,user_id,status,created_at,theme,objective,booking_url,scheduled_at,summary,recording_url,transcript";

      let disableOrderIndex = false;
      let { data: sessionsData, error: sessionsError } = await supabase
        .from("sessions")
        .select(primarySelect)
        .eq("user_id", targetUserId)
        .order("scheduled_at", { ascending: true });

      if (sessionsError && isOrderIndexMissingColumnError(sessionsError.message)) {
        disableOrderIndex = true;
        const fallbackResult = await supabase
          .from("sessions")
          .select(fallbackSelect)
          .eq("user_id", targetUserId)
          .order("scheduled_at", { ascending: true });
        sessionsData = fallbackResult.data as SessionItem[] | null;
        sessionsError = fallbackResult.error;
      }

      if (!shouldApply()) {
        return;
      }

      if (sessionsError) {
        if (isMissingSessionsTable(sessionsError)) {
          setSessionsLoadError("La table des séances est indisponible pour le moment.");
        } else {
          setSessionsLoadError(`Impossible de charger les séances : ${sessionsError.message}`);
        }
        return;
      }

      const normalizedSessions = disableOrderIndex
        ? ((sessionsData ?? []) as Array<Omit<SessionItem, "order_index">>).map((session) => ({ ...session, order_index: null }))
        : ((sessionsData ?? []) as SessionItem[]);

      setSessionsLoadError("");
      setSessions(normalizedSessions);
    },
    []
  );

  useEffect(() => {
    const selectedModuleId = expandedModuleId;
    if (!selectedModuleId) {
      return;
    }

    moduleRefs.current[selectedModuleId]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [expandedModuleId]);

  useEffect(() => {
    if (!showViewModeMenu) {
      return;
    }

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".tf-viewModeMenuWrap")) {
        return;
      }

      setShowViewModeMenu(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowViewModeMenu(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showViewModeMenu]);

  useEffect(() => {
    let parsed: PersistedStatsState | null = null;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        parsed = JSON.parse(raw) as PersistedStatsState;
      }
    } catch {
      parsed = null;
    }

    if (parsed) {
      if (parsed.viewMode === "accompagnement" || parsed.viewMode === "coaching") {
        setViewMode(parsed.viewMode);
      }

      if (parsed.coachTimeFilter === "all" || parsed.coachTimeFilter === "upcoming" || parsed.coachTimeFilter === "past") {
        setCoachTimeFilter(parsed.coachTimeFilter);
      }

      if (parsed.coachTopicFilter === "with" || parsed.coachTopicFilter === "without") {
        setCoachTopicFilter(parsed.coachTopicFilter);
      }

      if (parsed.selectedSessionId === null || typeof parsed.selectedSessionId === "string") {
        setSelectedSessionId(parsed.selectedSessionId ?? null);
      }

      if (parsed.activeLessonId === null || typeof parsed.activeLessonId === "string") {
        setActiveLessonId(parsed.activeLessonId ?? null);
      }

      if (parsed.expandedModuleId === null || typeof parsed.expandedModuleId === "string") {
        setExpandedModuleId(parsed.expandedModuleId ?? null);
      }

      if (parsed.activeTab === "lessons" || parsed.activeTab === "quiz") {
        setActiveTab(parsed.activeTab);
      }

      if (parsed.moduleFilter === "all" || parsed.moduleFilter === "todo" || parsed.moduleFilter === "done") {
        setModuleFilter(parsed.moduleFilter);
      }

      if (parsed.activeModuleId === null || typeof parsed.activeModuleId === "string") {
        setRestoredActiveModuleId(parsed.activeModuleId ?? null);
      }
    }

    setHasLoadedStoredState(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredState) {
      return;
    }

    const nextState: PersistedStatsState = {
      viewMode,
      coachTimeFilter,
      coachTopicFilter,
      selectedSessionId,
      activeLessonId,
      activeModuleId: activeModule?.id ?? null,
      expandedModuleId,
      activeTab,
      moduleFilter,
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      // Ignore localStorage errors.
    }
  }, [
    activeLessonId,
    activeModule,
    activeTab,
    coachTimeFilter,
    coachTopicFilter,
    expandedModuleId,
    hasLoadedStoredState,
    moduleFilter,
    selectedSessionId,
    viewMode,
  ]);

  useEffect(() => {
    function handleEngagementUpdate(event: Event) {
      const detail = (event as CustomEvent<{
        newXp?: number;
        streak_current?: number;
        streak_best?: number;
        period_progress?: number;
        cadence_target?: number;
        cadence_unit?: "day" | "week";
      }>).detail;

      if (!detail || typeof detail !== "object") {
        return;
      }

      if (typeof detail.streak_current === "number") {
        setStreakCurrent(Math.max(0, detail.streak_current));
      }

      setProfileEngagement((current) => {
        return {
          xp: typeof detail.newXp === "number" ? Math.max(0, detail.newXp) : current.xp,
          streak_current:
            typeof detail.streak_current === "number" ? Math.max(0, detail.streak_current) : current.streak_current,
          streak_best: typeof detail.streak_best === "number" ? Math.max(0, detail.streak_best) : current.streak_best,
          period_progress:
            typeof detail.period_progress === "number" ? Math.max(0, detail.period_progress) : current.period_progress,
          cadence_target:
            typeof detail.cadence_target === "number" ? Math.max(1, detail.cadence_target) : current.cadence_target,
          cadence_unit: detail.cadence_unit === "day" ? "day" : current.cadence_unit,
        };
      });
    }

    window.addEventListener("tf:engagement", handleEngagementUpdate as EventListener);
    return () => {
      window.removeEventListener("tf:engagement", handleEngagementUpdate as EventListener);
    };
  }, []);

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

      const currentUser = userData.user
        ? {
            id: userData.user.id,
            email: userData.user.email ?? null,
            created_at: userData.user.created_at ?? null,
            user_metadata:
              userData.user.user_metadata && typeof userData.user.user_metadata === "object"
                ? (userData.user.user_metadata as Record<string, unknown>)
                : null,
          }
        : null;

      setCurrentUser(currentUser);
      setUserId(currentUserId);

      if (!currentUserId) {
        setError("Impossible d'identifier l'utilisateur.");
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", currentUserId)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      setIsAdmin(!profileError && profileData?.is_admin === true);

      const { data: userEngagementRow, error: userEngagementError } = await supabase
        .from("user_engagement")
        .select("xp,streak_current,streak_best,cadence_target,cadence_unit,period_progress")
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (userEngagementError) {
        if (!isMissingUserEngagementTable(userEngagementError)) {
          setBadgeLoadError(`Impossible de charger le badge actuel : ${userEngagementError.message}`);
        }
        setProfileEngagement(EMPTY_PROFILE_ENGAGEMENT);
        setStreakCurrent(0);
      } else {
        const nextProfileEngagement: ProfileEngagement = {
          xp: Math.max(0, Number(userEngagementRow?.xp ?? 0)),
          streak_current: Math.max(0, Number(userEngagementRow?.streak_current ?? 0)),
          streak_best: Math.max(0, Number(userEngagementRow?.streak_best ?? 0)),
          cadence_target: Math.max(1, Number(userEngagementRow?.cadence_target ?? 1)),
          cadence_unit: userEngagementRow?.cadence_unit === "day" ? "day" : "week",
          period_progress: Math.max(0, Number(userEngagementRow?.period_progress ?? 0)),
        };

        setProfileEngagement(nextProfileEngagement);
        setStreakCurrent(nextProfileEngagement.streak_current);
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

      await fetchSessions(currentUserId, () => isMounted);

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
  }, [fetchSessions]);

  useEffect(() => {
    if (!restoredActiveModuleId || modules.length === 0) {
      return;
    }

    const restoredModule = modules.find((module) => module.id === restoredActiveModuleId) ?? null;
    if (restoredModule) {
      setActiveModule(restoredModule);
    }

    setRestoredActiveModuleId(null);
  }, [modules, restoredActiveModuleId]);

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

  const nextFreeBookingSession =
    [...sessions]
      .sort(sortBySessionOrder)
      .find(
        (session) =>
          session.status?.toLowerCase() === "planned" &&
          parseDate(session.scheduled_at) === null &&
          !session.theme &&
          isValidHttpUrl(session.booking_url)
      ) ?? null;

  const freeBookingUrl = nextFreeBookingSession?.booking_url ?? CALENDLY_FREE_FALLBACK_URL;

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

  const xpPerLevel = 4000;
  const profileXp = Math.max(0, profileEngagement.xp);
  const profileLevel = Math.floor(profileXp / xpPerLevel) + 1;
  const xpInLevel = profileXp % xpPerLevel;
  const xpProgressPercent = Math.max(0, Math.min(100, Math.round((xpInLevel / xpPerLevel) * 100)));

  const totalLessonsCount = moduleLessons.length;
  const completedLessonsCount = Object.values(completedByLessonId).filter((value) => value === true).length;
  const trainingProgressPercent = totalLessonsCount > 0 ? Math.round((completedLessonsCount / totalLessonsCount) * 100) : 0;

  const profileMetadata = currentUser?.user_metadata ?? {};
  const profileName =
    (typeof profileMetadata.full_name === "string" ? profileMetadata.full_name.trim() : "") ||
    (typeof profileMetadata.name === "string" ? profileMetadata.name.trim() : "") ||
    (currentUser?.email ? currentUser.email.split("@")[0] : "Utilisateur");
  const profileAvatarUrl =
    typeof profileMetadata.avatar_url === "string" && profileMetadata.avatar_url.trim().length > 0
      ? profileMetadata.avatar_url.trim()
      : null;
  const memberSinceLabel =
    currentUser?.created_at && parseDate(currentUser.created_at)
      ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(currentUser.created_at))
      : "Inconnu";

  const cadenceUnitLabel = profileEngagement.cadence_unit === "day" ? "jour" : "semaine";
  const badgesUnlocked = badges.filter((badge) => badge.unlocked);
  const badgesLocked = badges.filter((badge) => !badge.unlocked);

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

  const calendarSessionsByDateKey: Record<string, CalendarSessionItem[]> = {};
  const loginDaySet = new Set(calendarLoginDays);
  const plannedDaySet = new Set<string>();
  const completedDaySet = new Set<string>();

  for (const session of calendarSessions) {
    const sessionTimestamp = parseDate(session.scheduled_at);
    if (sessionTimestamp === null) {
      continue;
    }

    const dateKey = toLocalDateKey(new Date(sessionTimestamp));
    const list = calendarSessionsByDateKey[dateKey] ?? [];
    list.push(session);
    calendarSessionsByDateKey[dateKey] = list;

    if (session.status?.toLowerCase() === "completed") {
      completedDaySet.add(dateKey);
    } else {
      plannedDaySet.add(dateKey);
    }
  }

  for (const dateKey of Object.keys(calendarSessionsByDateKey)) {
    calendarSessionsByDateKey[dateKey].sort((a, b) => {
      const timeA = parseDate(a.scheduled_at) ?? 0;
      const timeB = parseDate(b.scheduled_at) ?? 0;
      return timeA - timeB;
    });
  }

  const calendarCurrentMonth = getMonthStart(calendarMonthDate);
  const calendarMonthTitle = formatMonthTitle(calendarCurrentMonth);
  const calendarDaysInMonth = new Date(calendarCurrentMonth.getFullYear(), calendarCurrentMonth.getMonth() + 1, 0).getDate();
  const calendarStartOffset = (calendarCurrentMonth.getDay() + 6) % 7;
  const calendarGridCells: Array<{ dateKey: string | null; dayNumber: number | null }> = [];

  for (let index = 0; index < calendarStartOffset; index += 1) {
    calendarGridCells.push({ dateKey: null, dayNumber: null });
  }

  for (let day = 1; day <= calendarDaysInMonth; day += 1) {
    const dateKey = toLocalDateKey(new Date(calendarCurrentMonth.getFullYear(), calendarCurrentMonth.getMonth(), day));
    calendarGridCells.push({ dateKey, dayNumber: day });
  }

  const selectedDaySessions = selectedCalendarDateKey ? calendarSessionsByDateKey[selectedCalendarDateKey] ?? [] : [];
  const selectedDateReadable = selectedCalendarDateKey ? formatDateKeyReadable(selectedCalendarDateKey) : "";
  const calendarPlannedCount = calendarSessions.filter((session) => session.status?.toLowerCase() === "planned").length;
  const calendarCompletedCount = calendarSessions.filter((session) => session.status?.toLowerCase() === "completed").length;

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

  const coachThemeOrderMap = new Map<string, number>(COACH_THEME_ORDER.map((theme, index) => [theme, index]));
  const coachBaseSessions = sessions.filter((session) => {
    const hasTheme = !!session.theme?.trim();
    return coachTopicFilter === "with" ? hasTheme : !hasTheme;
  });

  const coachSessionsFilteredByTime = coachBaseSessions.filter((session) => {
    if (coachTimeFilter === "all") {
      return true;
    }

    const uiState = getSessionUiState(session);
    if (coachTimeFilter === "upcoming") {
      return uiState === "scheduled";
    }

    return uiState === "done" || uiState === "awaiting_validation";
  });

  const coachSessionsSorted = [...coachSessionsFilteredByTime].sort((a, b) => {
    if (coachTopicFilter === "with") {
      const rankA = a.theme ? (coachThemeOrderMap.get(a.theme) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
      const rankB = b.theme ? (coachThemeOrderMap.get(b.theme) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      const timeA = parseDate(a.scheduled_at);
      const timeB = parseDate(b.scheduled_at);
      if (timeA !== null && timeB !== null && timeA !== timeB) {
        return timeA - timeB;
      }
      if (timeA === null && timeB !== null) {
        return 1;
      }
      if (timeA !== null && timeB === null) {
        return -1;
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

    const createdAtA = parseDate(a.created_at);
    const createdAtB = parseDate(b.created_at);
    if (createdAtA !== null && createdAtB !== null && createdAtA !== createdAtB) {
      return createdAtB - createdAtA;
    }
    if (createdAtA === null && createdAtB !== null) {
      return 1;
    }
    if (createdAtA !== null && createdAtB === null) {
      return -1;
    }

    return b.id.localeCompare(a.id, "fr");
  });

  const selectedCoachSession =
    (selectedSessionId ? coachSessionsSorted.find((session) => session.id === selectedSessionId) : null) ?? null;

  const selectedCoachSessionUiState = selectedCoachSession ? getSessionUiState(selectedCoachSession) : null;
  const isSelectedCoachSessionDone = selectedCoachSessionUiState === "done";
  const isSelectedCoachSessionToPlan = selectedCoachSessionUiState === "to_schedule";
  const isSelectedCoachSessionProgrammed = selectedCoachSessionUiState === "scheduled";
  const isSelectedCoachSessionAwaitingValidation = selectedCoachSessionUiState === "awaiting_validation";

  const coachingHeaderStatus = selectedCoachSession
    ? isSelectedCoachSessionDone
      ? { label: "Faite", className: "tf-chip tf-chip--done" }
      : isSelectedCoachSessionAwaitingValidation
        ? { label: "En attente", className: "tf-chip tf-chip--awaiting" }
      : isSelectedCoachSessionProgrammed
        ? { label: "Programmée", className: "tf-chip tf-chip--planned" }
        : { label: "À programmer", className: "tf-chip" }
    : null;

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

  function openCalendlyWindow(baseUrl: string | null | undefined) {
    if (!baseUrl || !isValidHttpUrl(baseUrl)) {
      return;
    }

    const openedWindow = window.open(buildCalendlyUrl(baseUrl, currentUser), "_blank", "noopener,noreferrer");
    if (openedWindow) {
      openedWindow.opener = null;
    }
  }

  function trackFreeBookingClick() {
    if (!userId) {
      return;
    }

    const dateKey = toLocalDateKey(new Date());

    void (async () => {
      try {
        const result = await registerEngagementAction({
          userId,
          eventKey: `booking_free_clicked:${dateKey}`,
          xpGain: 0,
        });

        if (result.applied) {
          window.dispatchEvent(new CustomEvent("tf:engagement", { detail: result }));
        }
      } catch {
        // Ne bloque jamais l'ouverture de Calendly si le tracking échoue.
      }
    })();
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

  useEffect(() => {
    function handleNavigateToCoaching(event: Event) {
      const detail = (event as CustomEvent<{ topic?: "with" | "without" }>).detail;
      if (!detail || detail.topic !== "with") {
        return;
      }

      setViewMode("coaching");
      setCoachTopicFilter("with");
      setCoachTimeFilter("all");
      setShowViewModeMenu(false);
      setShowExpandedContent(false);
      setPendingCoachingSelect(true);
    }

    window.addEventListener("tf:navigateToCoaching", handleNavigateToCoaching as EventListener);
    return () => {
      window.removeEventListener("tf:navigateToCoaching", handleNavigateToCoaching as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!selectedSessionId) {
      return;
    }

    const stillVisible = coachSessionsSorted.some((session) => session.id === selectedSessionId);
    if (!stillVisible) {
      setSelectedSessionId(coachSessionsSorted[0]?.id ?? null);
    }
  }, [coachSessionsSorted, selectedSessionId]);

  useEffect(() => {
    if (!pendingCoachingSelect || viewMode !== "coaching") {
      return;
    }

    if (loading) {
      return;
    }

    const pickedSessionId = pickWithTopicSessionId(sessions);
    setSelectedSessionId(pickedSessionId);
    setPendingCoachingSelect(false);
  }, [loading, pendingCoachingSelect, sessions, viewMode]);

  useEffect(() => {
    if (viewMode === "accompagnement") {
      setNeedsAutoSelectLesson(true);
    }
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "accompagnement") {
      return;
    }

    if (!needsAutoSelectLesson) {
      return;
    }

    if (modules.length === 0 || moduleLessons.length === 0) {
      return;
    }

    const moduleOrderById = new Map(modules.map((module, index) => [module.id, index]));
    const lessonsSorted = [...moduleLessons]
      .filter((lesson) => lesson.is_published !== false)
      .sort((a, b) => {
        const moduleOrderA = a.module_id ? (moduleOrderById.get(a.module_id) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
        const moduleOrderB = b.module_id ? (moduleOrderById.get(b.module_id) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;

        if (moduleOrderA !== moduleOrderB) {
          return moduleOrderA - moduleOrderB;
        }

        const lessonOrderA = a.order_index ?? 0;
        const lessonOrderB = b.order_index ?? 0;
        if (lessonOrderA !== lessonOrderB) {
          return lessonOrderA - lessonOrderB;
        }

        return a.id.localeCompare(b.id, "fr");
      });

    const progressByLessonId: Record<string, { status?: string | null; done_at?: string | null }> = {};
    for (const [lessonId, done] of Object.entries(completedByLessonId)) {
      if (done) {
        progressByLessonId[lessonId] = { status: "done" };
      }
    }

    const nextLesson =
      lessonsSorted.find((lesson) => !isLessonDone(progressByLessonId[lesson.id])) ??
      lessonsSorted[lessonsSorted.length - 1] ??
      null;

    if (nextLesson?.id) {
      setActiveLessonId(nextLesson.id);
      setActiveTab("lessons");

      if (nextLesson.module_id) {
        const nextModule = modules.find((module) => module.id === nextLesson.module_id) ?? null;
        if (nextModule) {
          setActiveModule(nextModule);
        }
      }
    }

    setNeedsAutoSelectLesson(false);
  }, [completedByLessonId, moduleLessons, modules, needsAutoSelectLesson, viewMode]);

  useEffect(() => {
    if (!isCalendarOpen || !userId) {
      return;
    }

    let isMounted = true;

    (async () => {
      setCalendarLoading(true);
      setCalendarError("");

      const monthStart = getMonthStart(calendarMonthDate);
      const nextMonthStart = getNextMonthStart(calendarMonthDate);
      const startOfMonthIso = monthStart.toISOString();
      const startOfNextMonthIso = nextMonthStart.toISOString();

      let nextCalendarSessions: CalendarSessionItem[] = [];
      let nextCalendarLoginDays: string[] = [];
      let nextError = "";

      const { data: monthSessions, error: monthSessionsError } = await supabase
        .from("sessions")
        .select("id,status,scheduled_at,theme,booking_url")
        .eq("user_id", userId)
        .gte("scheduled_at", startOfMonthIso)
        .lt("scheduled_at", startOfNextMonthIso)
        .order("scheduled_at", { ascending: true });

      if (monthSessionsError) {
        nextError = isMissingSessionsTable(monthSessionsError)
          ? "La table des séances est indisponible pour le moment."
          : `Impossible de charger le calendrier : ${monthSessionsError.message}`;
      } else {
        nextCalendarSessions = (monthSessions ?? []) as CalendarSessionItem[];
      }

      const { data: loginEvents, error: loginEventsError } = await supabase
        .from("engagement_events")
        .select("event_key,created_at")
        .eq("user_id", userId)
        .gte("created_at", startOfMonthIso)
        .lt("created_at", startOfNextMonthIso)
        .like("event_key", "login:%");

      if (loginEventsError) {
        if (!isMissingEngagementEventsTable(loginEventsError) && !nextError) {
          nextError = `Impossible de charger les connexions du mois : ${loginEventsError.message}`;
        }
      } else {
        const loginDaySet = new Set<string>();

        for (const row of (loginEvents ?? []) as Array<{ event_key: string | null; created_at: string | null }>) {
          const eventKey = row.event_key?.trim() ?? "";
          if (!eventKey.startsWith("login:")) {
            continue;
          }

          const dateKey = eventKey.slice("login:".length).trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
            loginDaySet.add(dateKey);
          }
        }

        nextCalendarLoginDays = [...loginDaySet].sort((a, b) => a.localeCompare(b, "fr"));
      }

      if (!isMounted) {
        return;
      }

      setCalendarSessions(nextCalendarSessions);
      setCalendarLoginDays(nextCalendarLoginDays);
      setCalendarError(nextError);
      setCalendarLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, [calendarMonthDate, isCalendarOpen, userId]);

  useEffect(() => {
    if (viewMode !== "coaching" || !userId) {
      return;
    }

    void fetchSessions(userId);
  }, [fetchSessions, userId, viewMode]);

  useEffect(() => {
    if (viewMode !== "coaching" || !userId) {
      return;
    }

    const handleFocus = () => {
      void fetchSessions(userId);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchSessions(userId);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const intervalId = window.setInterval(() => {
      void fetchSessions(userId);
    }, 15000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [fetchSessions, userId, viewMode]);

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

  function renderCoachingPanelBody() {
    if (!selectedCoachSession) {
      return <div className="empty-state">Choisis une séance à gauche pour afficher son détail.</div>;
    }

    if (isSelectedCoachSessionToPlan) {
      return (
        <div className="tf-paneStack">
          <div className="tf-coachHeroIcon" aria-hidden="true">📅</div>
          <h3 className="tf-title" style={{ margin: 0 }}>Séance à programmer</h3>
          <p className="tf-subtitle" style={{ margin: 0 }}>
            Cette séance n&apos;a pas encore de créneau. Réserve maintenant pour la planifier.
          </p>
          <div>
            <button
              type="button"
              className="tf-btn tf-btn--accent"
              onClick={() => openCalendlyWindow(resolveSessionBookingUrl(selectedCoachSession))}
              disabled={!isValidHttpUrl(resolveSessionBookingUrl(selectedCoachSession))}
            >
              Réserver cette séance
            </button>
          </div>
        </div>
      );
    }

    if (isSelectedCoachSessionProgrammed) {
      const plannedDateLabel = formatDate(selectedCoachSession.scheduled_at) ?? "date non disponible";
      return (
        <div className="tf-paneStack">
          <h3 className="tf-title" style={{ margin: 0 }}>Séance programmée</h3>
          <p className="tf-subtitle" style={{ margin: 0 }}>Déjà planifiée pour le {plannedDateLabel}.</p>
          <div>
            <button
              type="button"
              className="tf-btn tf-btn--planned"
              onClick={() => openCalendlyWindow(resolveSessionBookingUrl(selectedCoachSession))}
              disabled={!isValidHttpUrl(resolveSessionBookingUrl(selectedCoachSession))}
            >
              Reprogrammer la séance
            </button>
          </div>
        </div>
      );
    }

    if (isSelectedCoachSessionAwaitingValidation) {
      const plannedDateLabel = formatDate(selectedCoachSession.scheduled_at) ?? "date non disponible";
      return (
        <div className="tf-paneStack">
          <h3 className="tf-title" style={{ margin: 0 }}>Séance en attente de validation</h3>
          <p className="tf-subtitle" style={{ margin: 0 }}>
            Ta séance du {plannedDateLabel} est terminée. Notre équipe ajoute le replay et la synthèse.
          </p>
          <div>
            <button type="button" className="tf-btn" disabled>
              Validation en cours
            </button>
          </div>
        </div>
      );
    }

    const recordingUrl = selectedCoachSession.recording_url?.trim() ?? "";
    const canShowRecording = isValidHttpUrl(recordingUrl);
    const transcriptText = selectedCoachSession.transcript?.trim();
    const summaryText = selectedCoachSession.summary?.trim();

    return (
      <div className="tf-paneStack">
        {canShowRecording ? (
          <div className="modal-video">
            <iframe
              src={recordingUrl}
              title={`Enregistrement ${selectedCoachSession.theme ?? "séance libre"}`}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="empty-state">Enregistrement non disponible pour le moment.</div>
        )}

        <section className="card tf-card">
          <h4 className="card-title tf-title">Transcription</h4>
          <p className="card-text" style={{ whiteSpace: "pre-wrap" }}>
            {transcriptText || "En cours de traitement"}
          </p>
        </section>

        <section className="card tf-card">
          <h4 className="card-title tf-title">Résumé</h4>
          <p className="card-text" style={{ whiteSpace: "pre-wrap" }}>
            {summaryText || "Résumé indisponible pour le moment."}
          </p>
        </section>
      </div>
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

  const isAccompagnementActive = location.pathname === "/" || location.pathname === "/stats";
  const isAdminActive = location.pathname === "/admin";

  return (
    <>
      {error && <div className="error-box">{error}</div>}
      {loading && <p className="muted tf-muted">Chargement...</p>}

      {!loading && (
        <section className="tf-dashboard">
          <aside className="tf-sidebar tf-card tf-card--flat">
            <div className="tf-sidebarLogo">TF</div>
            <nav className="tf-sidebarMenu" aria-label="Navigation principale">
              <button
                type="button"
                className={`tf-sidebarItem${isAccompagnementActive ? " tf-sidebarItemActive" : ""}`}
                onClick={() => {
                  setViewMode("accompagnement");
                  navigate("/");
                }}
                aria-current={isAccompagnementActive ? "page" : undefined}
              >
                <span className="tf-sidebarIcon" aria-hidden="true">
                  ◈
                </span>
                <span className="tf-sidebarLabel">Accompagnement</span>
              </button>

              <button
                type="button"
                className="tf-sidebarItem"
                onClick={() => setShowPilotageSoon(true)}
              >
                <span className="tf-sidebarIcon" aria-hidden="true">
                  ◔
                </span>
                <span className="tf-sidebarLabel">Pilotage</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  className={`tf-sidebarItem${isAdminActive ? " tf-sidebarItemActive" : ""}`}
                  onClick={() => navigate("/admin")}
                  aria-current={isAdminActive ? "page" : undefined}
                >
                  <span className="tf-sidebarIcon" aria-hidden="true">
                    ◉
                  </span>
                  <span className="tf-sidebarLabel">Administrateur</span>
                </button>
              )}
            </nav>
          </aside>

          <main className="tf-dashboardMain">
            <div className="tf-topRow">
              <div className="tf-viewModeMenuWrap">
                <button
                  type="button"
                  className="card-button tf-card tf-card--flat tf-academyCard"
                  onClick={() => setShowViewModeMenu((current) => !current)}
                  aria-haspopup="menu"
                  aria-expanded={showViewModeMenu}
                >
                  <div className="tf-topSelectRow">
                    <span className="tf-quickIcon" aria-hidden="true">◈</span>
                    <span className="tf-topSelectText">{viewMode === "coaching" ? "Coaching" : "Accompagnement"}</span>
                    <span className="tf-academyCaret" aria-hidden="true">⌄</span>
                  </div>
                </button>

                {showViewModeMenu && (
                  <div className="tf-viewModeMenu" role="menu" aria-label="Choix du mode">
                    <button
                      type="button"
                      className={`tf-viewModeMenuItem${viewMode === "accompagnement" ? " isActive" : ""}`}
                      role="menuitem"
                      onClick={() => {
                        setViewMode("accompagnement");
                        setShowExpandedContent(false);
                        setShowViewModeMenu(false);
                      }}
                    >
                      Accompagnement
                    </button>
                    <button
                      type="button"
                      className={`tf-viewModeMenuItem${viewMode === "coaching" ? " isActive" : ""}`}
                      role="menuitem"
                      onClick={() => {
                        setViewMode("coaching");
                        setShowExpandedContent(false);
                        setShowViewModeMenu(false);
                      }}
                    >
                      Coaching
                    </button>
                  </div>
                )}
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
                    setCalendarMonthDate(getMonthStart(new Date()));
                    setSelectedCalendarDateKey(null);
                    setIsCalendarOpen(true);
                  }}
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
                  onClick={() => setShowProfileModal(true)}
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
                {viewMode === "accompagnement" ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <div className="tf-cardHeader" style={{ alignItems: "center" }}>
                      <div style={{ display: "grid", gap: 10, width: "100%" }}>
                        <div className="tf-tabs tf-coachTabs" style={{ flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className={`tf-tab${coachTimeFilter === "all" ? " isActive" : ""}`}
                            onClick={() => setCoachTimeFilter("all")}
                          >
                            Toute
                          </button>
                          <button
                            type="button"
                            className={`tf-tab${coachTimeFilter === "upcoming" ? " isActive" : ""}`}
                            onClick={() => setCoachTimeFilter("upcoming")}
                          >
                            À venir
                          </button>
                          <button
                            type="button"
                            className={`tf-tab${coachTimeFilter === "past" ? " isActive" : ""}`}
                            onClick={() => setCoachTimeFilter("past")}
                          >
                            Passée
                          </button>
                        </div>
                        <div className="tf-tabs tf-coachTopicToggle" style={{ flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className={`tf-tab${coachTopicFilter === "with" ? " isActive" : ""}`}
                            onClick={() => setCoachTopicFilter("with")}
                          >
                            Avec sujet
                          </button>
                          <button
                            type="button"
                            className={`tf-tab${coachTopicFilter === "without" ? " isActive" : ""}`}
                            onClick={() => setCoachTopicFilter("without")}
                          >
                            Sans sujet
                          </button>
                        </div>
                      </div>
                    </div>

                    {sessionsLoadError && <div className="error-box">{sessionsLoadError}</div>}

                    <div className="tf-scroll">
                      <div className="tf-paneStack">
                        {coachSessionsSorted.length === 0 && (
                          <div className="empty-state">
                            {coachTimeFilter === "upcoming"
                              ? "Aucune séance à venir pour ce filtre."
                              : coachTimeFilter === "past"
                                ? "Aucune séance passée pour ce filtre."
                                : "Aucune séance disponible pour ce filtre."}
                          </div>
                        )}

                        {coachSessionsSorted.map((session, index) => {
                          const isSelectedSession = selectedSessionId === session.id;
                          const sessionUiState = getSessionUiState(session);
                          const sessionBadgeLabel =
                            sessionUiState === "done"
                              ? "Faite"
                              : sessionUiState === "scheduled"
                                ? "Programmée"
                                : sessionUiState === "awaiting_validation"
                                  ? "En attente"
                                  : "À programmer";
                          const sessionBadgeClass =
                            sessionUiState === "done"
                              ? "tf-sessionBadge tf-sessionBadge--done"
                              : sessionUiState === "scheduled"
                                ? "tf-sessionBadge tf-sessionBadge--planned"
                                : sessionUiState === "awaiting_validation"
                                  ? "tf-sessionBadge tf-sessionBadge--awaiting"
                                  : "tf-sessionBadge tf-sessionBadge--todo";
                          const sessionDateLabel = formatDate(session.scheduled_at);

                          return (
                            <button
                              key={session.id}
                              type="button"
                              className={`card-button tf-card tf-moduleCardFixed tf-sessionCard${isSelectedSession ? " tf-moduleCard--active tf-sessionCard--active" : ""}`}
                              onClick={() => setSelectedSessionId(session.id)}
                              aria-label={`Sélectionner la séance ${session.theme ?? "sans sujet"}`}
                            >
                              <div className="tf-moduleTop">
                                <div className="tf-moduleTitleBlock">
                                  <h4 className="tf-moduleTitle tf-clamp2">{session.theme ?? "Séance libre (sujet au choix)"}</h4>
                                  <span className={`tf-moduleBadge tf-moduleBadge--small ${sessionBadgeClass}`}>{sessionBadgeLabel}</span>
                                  {sessionUiState === "awaiting_validation" && sessionDateLabel && (
                                    <span className="card-meta" style={{ whiteSpace: "nowrap" }}>
                                      {sessionDateLabel}
                                    </span>
                                  )}
                                </div>
                                <span
                                  className="card-meta"
                                  aria-label={`Séance numéro ${index + 1}`}
                                  style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}
                                >
                                  {index + 1}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </section>

              <section className="tf-centerPane tf-card" style={{ padding: 14 }}>
                {viewMode === "accompagnement" && quizDataError && <div className="error-box">{quizDataError}</div>}

                <div className="tf-scroll">
                  <div className="tf-paneStack">
                    {viewMode === "accompagnement" && activeModule && (
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

                    {viewMode === "coaching" && selectedCoachSession && (
                      <div className="tf-contentHeader">
                        <div className="tf-titleRow">
                          <h2 className="tf-contentTitle tf-title">{selectedCoachSession.theme ?? "Séance libre (sujet au choix)"}</h2>
                          <div className="tf-titleActions">
                            {coachingHeaderStatus && <span className={coachingHeaderStatus.className}>{coachingHeaderStatus.label}</span>}
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
                        {selectedCoachSession.objective && <p className="tf-contentSubtitle">{selectedCoachSession.objective}</p>}
                      </div>
                    )}

                    {viewMode === "accompagnement" ? renderActivePanelBody() : renderCoachingPanelBody()}
                  </div>
                </div>
              </section>
            </div>
          </main>
        </section>
      )}

      {showPilotageSoon && (
        <div className="modal-backdrop tf-modalBackdrop" onClick={() => setShowPilotageSoon(false)}>
          <div
            className="modal-panel tf-modalPanel tf-card"
            onClick={(event) => event.stopPropagation()}
            style={{ width: "min(480px, 100%)", maxHeight: "80vh" }}
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title tf-title">Pilotage</h3>
                <p className="tf-subtitle" style={{ margin: "6px 0 0" }}>
                  En travaux — reviens plus tard.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setShowPilotageSoon(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showExpandedContent && ((viewMode === "accompagnement" && activeModule) || (viewMode === "coaching" && selectedCoachSession)) && (
        <div className="modal-backdrop tf-modalBackdrop" onClick={() => setShowExpandedContent(false)}>
          <div
            className="modal-panel tf-modalPanel tf-card"
            onClick={(event) => event.stopPropagation()}
            style={{ width: "min(1180px, 100%)", maxHeight: "90vh" }}
          >
            <div className="modal-header">
              {viewMode === "accompagnement" && activeModule ? (
                <div>
                  <p className="card-meta tf-chip tf-chip--accent">Module</p>
                  <h3 className="modal-title tf-title">{activeModule.title}</h3>
                  {activeModule.description && <p className="tf-contentSubtitle">{activeModule.description}</p>}
                </div>
              ) : (
                <div>
                  <p className="card-meta tf-chip tf-chip--accent">Coaching</p>
                  <h3 className="modal-title tf-title">{selectedCoachSession?.theme ?? "Séance libre (sujet au choix)"}</h3>
                  {selectedCoachSession?.objective && <p className="tf-contentSubtitle">{selectedCoachSession.objective}</p>}
                </div>
              )}
              <div className="tf-paneActions" style={{ alignItems: "center", flexWrap: "wrap" }}>
                {viewMode === "accompagnement" && activeStatus && <span className={activeStatus.className}>{activeStatus.label}</span>}
                {viewMode === "coaching" && coachingHeaderStatus && <span className={coachingHeaderStatus.className}>{coachingHeaderStatus.label}</span>}
                <button type="button" className="btn" onClick={() => setShowExpandedContent(false)}>
                  Fermer
                </button>
              </div>
            </div>

            <div className="tf-scroll" style={{ maxHeight: "calc(90vh - 180px)" }}>
              <div className="tf-paneStack">{viewMode === "accompagnement" ? renderActivePanelBody() : renderCoachingPanelBody()}</div>
            </div>
          </div>
        </div>
      )}

      {showProfileModal && (
        <div className="modal-backdrop tf-modalBackdrop" onClick={() => setShowProfileModal(false)}>
          <div className="modal-panel tf-modalPanel tf-card" onClick={(event) => event.stopPropagation()} style={{ width: "min(1080px, 100%)", maxHeight: "90vh" }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title tf-title">Mon Profil</h3>
                <p className="tf-subtitle" style={{ margin: "6px 0 0" }}>
                  Suis ta progression, tes streaks et tes badges débloqués.
                </p>
              </div>
              <button type="button" className="btn" aria-label="Fermer le profil" onClick={() => setShowProfileModal(false)}>
                ×
              </button>
            </div>

            <div className="tf-scroll" style={{ maxHeight: "72vh" }}>
              <div className="tf-profileGrid">
                <div className="tf-profileCol">
                  <article className="tf-profileCard">
                    <div className="tf-profileHeader">
                      <div className="tf-profileAvatarWrap">
                        {profileAvatarUrl ? (
                          <img src={profileAvatarUrl} alt={profileName} className="tf-profileAvatar" />
                        ) : (
                          <div className="tf-profileAvatar tf-profileAvatar--fallback" aria-hidden="true">
                            {profileName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="tf-profileLevelBadge">Niv. {profileLevel}</span>
                      </div>
                      <div>
                        <h4 className="tf-title" style={{ margin: 0 }}>{profileName}</h4>
                        <p className="tf-subtitle" style={{ margin: "6px 0 0" }}>{currentUser?.email ?? "Email non disponible"}</p>
                        <p className="tf-muted" style={{ margin: "6px 0 0" }}>Membre depuis {memberSinceLabel}</p>
                      </div>
                    </div>

                    <div className="tf-profileBlock">
                      <div className="tf-profileRow">
                        <span className="tf-subtitle">XP totale</span>
                        <strong className="tf-title">{profileXp.toLocaleString("fr-FR")} XP</strong>
                      </div>
                      <div className="tf-profileProgress">
                        <div className="tf-profileProgressFill" style={{ width: `${xpProgressPercent}%` }} />
                      </div>
                      <p className="tf-muted" style={{ margin: 0 }}>
                        Niveau {profileLevel} · {xpInLevel.toLocaleString("fr-FR")} / {xpPerLevel.toLocaleString("fr-FR")} XP
                      </p>
                    </div>
                  </article>

                  <article className="tf-streakCard">
                    <h4 className="tf-title" style={{ margin: 0 }}>Streak</h4>
                    <div className="tf-profileStatsGrid">
                      <div className="tf-profileStatItem">
                        <span className="tf-muted">Actuelle</span>
                        <strong className="tf-title">{profileEngagement.streak_current}</strong>
                      </div>
                      <div className="tf-profileStatItem">
                        <span className="tf-muted">Record</span>
                        <strong className="tf-title">{profileEngagement.streak_best}</strong>
                      </div>
                    </div>
                    <p className="tf-subtitle" style={{ margin: 0 }}>
                      Objectif {profileEngagement.period_progress} / {profileEngagement.cadence_target} par {cadenceUnitLabel}
                    </p>
                  </article>

                  <article className="tf-statsCard">
                    <h4 className="tf-title" style={{ margin: 0 }}>Statistiques</h4>
                    <div className="tf-profileStatsGrid">
                      <div className="tf-profileStatItem">
                        <span className="tf-muted">Leçons terminées</span>
                        <strong className="tf-title">{completedLessonsCount}</strong>
                      </div>
                      <div className="tf-profileStatItem">
                        <span className="tf-muted">Quiz réussis</span>
                        <strong className="tf-title">{quizPassedCount}</strong>
                      </div>
                      <div className="tf-profileStatItem">
                        <span className="tf-muted">Séances coaching</span>
                        <strong className="tf-title">{coachingCompletedCount}</strong>
                      </div>
                    </div>
                  </article>
                </div>

                <div className="tf-profileCol">
                  <article className="tf-trainingProgressCard">
                    <h4 className="tf-title" style={{ margin: 0 }}>Progression formation</h4>
                    <div className="tf-profileRow">
                      <span className="tf-subtitle">Avancement global</span>
                      <strong className="tf-title">{trainingProgressPercent}%</strong>
                    </div>
                    <div className="tf-profileProgress">
                      <div className="tf-profileProgressFill" style={{ width: `${trainingProgressPercent}%` }} />
                    </div>
                    <p className="tf-muted" style={{ margin: 0 }}>
                      {completedLessonsCount} / {totalLessonsCount} leçons terminées
                    </p>
                  </article>

                  <article className="tf-badgesCard">
                    <h4 className="tf-title" style={{ margin: 0 }}>Badges</h4>

                    <div className="tf-profileBadgesSection">
                      <p className="tf-profileBadgesTitle">DÉBLOQUÉS</p>
                      <div className="tf-profileBadgesGrid">
                        {badgesUnlocked.length === 0 && <p className="tf-muted">Aucun badge débloqué pour l’instant.</p>}
                        {badgesUnlocked.map((badge) => (
                          <article key={badge.id} className="tf-profileBadge">
                            <p className="tf-profileBadgeName">{badge.name}</p>
                            <p className="tf-profileBadgeText">{badge.reachedText}</p>
                          </article>
                        ))}
                      </div>
                    </div>

                    <div className="tf-profileBadgesSection">
                      <p className="tf-profileBadgesTitle">À DÉBLOQUER</p>
                      <div className="tf-profileBadgesGrid">
                        {badgesLocked.length === 0 && <p className="tf-muted">Tous les badges sont débloqués.</p>}
                        {badgesLocked.map((badge) => (
                          <article key={badge.id} className="tf-profileBadge tf-profileBadge--locked">
                            <p className="tf-profileBadgeName">{badge.name}</p>
                            <p className="tf-profileBadgeText">{badge.conditionText}</p>
                          </article>
                        ))}
                      </div>
                    </div>
                  </article>
                </div>
              </div>
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
                        <a
                          href={buildCalendlyUrl(resolveSessionBookingUrl(session) ?? "#", currentUser)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-primary card-action"
                        >
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

      {isCalendarOpen && (
        <div
          className="modal-backdrop tf-modalBackdrop"
          onClick={() => {
            setIsCalendarOpen(false);
            setSelectedCalendarDateKey(null);
          }}
        >
          <div
            className="modal-panel tf-modalPanel tf-card"
            onClick={(event) => event.stopPropagation()}
            style={{ width: "min(1180px, 100%)", maxHeight: "90vh" }}
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title tf-title">Mon Calendrier</h3>
                <p className="tf-subtitle" style={{ margin: "6px 0 0" }}>
                  Suis tes connexions, tes rendez-vous et ton activité du mois.
                </p>
              </div>
              <button
                type="button"
                className="btn"
                aria-label="Fermer le calendrier"
                onClick={() => {
                  setIsCalendarOpen(false);
                  setSelectedCalendarDateKey(null);
                }}
              >
                ×
              </button>
            </div>

            {calendarError && <div className="error-box">{calendarError}</div>}

            <div className="tf-calendarLayout">
              <div className="tf-calendarMain">
                <div className="tf-calendarNav">
                  <button
                    type="button"
                    className="tf-btn"
                    onClick={() => {
                      setSelectedCalendarDateKey(null);
                      setCalendarMonthDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
                    }}
                  >
                    Précédent
                  </button>
                  <h4 className="tf-title tf-calendarMonthTitle">{calendarMonthTitle}</h4>
                  <button
                    type="button"
                    className="tf-btn"
                    onClick={() => {
                      setSelectedCalendarDateKey(null);
                      setCalendarMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
                    }}
                  >
                    Suivant
                  </button>
                </div>

                <div className="tf-calendarWeekdays" role="presentation">
                  {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((label) => (
                    <span key={label} className="tf-calendarWeekday">
                      {label}
                    </span>
                  ))}
                </div>

                <div className="tf-calendarGrid">
                  {calendarGridCells.map((cell, index) => {
                    if (!cell.dateKey || !cell.dayNumber) {
                      return <div key={`empty-${index}`} className="tf-calendarDay tf-calendarDay--empty" aria-hidden="true" />;
                    }

                    const hasLogin = loginDaySet.has(cell.dateKey);
                    const hasPlanned = plannedDaySet.has(cell.dateKey);
                    const hasCompleted = completedDaySet.has(cell.dateKey);
                    const hasActivity = hasLogin || hasPlanned || hasCompleted;
                    const toneClass = hasCompleted
                      ? " isCompleted"
                      : hasPlanned
                        ? " isPlanned"
                        : hasLogin
                          ? " isLogin"
                          : "";

                    return (
                      <button
                        key={cell.dateKey}
                        type="button"
                        className={`tf-calendarDay${toneClass}${hasActivity ? " isInteractive" : ""}`}
                        onClick={() => {
                          if (!hasActivity) {
                            return;
                          }

                          setSelectedCalendarDateKey(cell.dateKey);
                        }}
                        disabled={!hasActivity}
                        aria-label={`Jour ${cell.dayNumber}`}
                      >
                        <span className="tf-calendarDayNumber">{cell.dayNumber}</span>
                        <div className="tf-calendarMarkers">
                          {hasLogin && <span className="tf-calendarMarker tf-calendarMarker--login">Connexion</span>}
                          {hasPlanned && <span className="tf-calendarMarker tf-calendarMarker--planned">Séance programmée</span>}
                          {hasCompleted && <span className="tf-calendarMarker tf-calendarMarker--completed">Séance effectuée</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {calendarLoading && <p className="muted tf-muted">Chargement du calendrier...</p>}

                <div className="tf-calendarLegend">
                  <span className="tf-calendarLegendItem">
                    <span className="tf-calendarDot tf-calendarDot--login" aria-hidden="true" />
                    Connexion
                  </span>
                  <span className="tf-calendarLegendItem">
                    <span className="tf-calendarDot tf-calendarDot--planned" aria-hidden="true" />
                    Séance programmée
                  </span>
                  <span className="tf-calendarLegendItem">
                    <span className="tf-calendarDot tf-calendarDot--completed" aria-hidden="true" />
                    Séance effectuée
                  </span>
                </div>
              </div>

              <aside className="tf-calendarSidebar">
                <div className="tf-card tf-card--flat tf-calendarPanel">
                  <h4 className="tf-title" style={{ margin: 0 }}>Prendre un rendez-vous</h4>
                  <p className="tf-subtitle" style={{ margin: "6px 0 0" }}>
                    Choisis le bon créneau. Les informations sont préremplies automatiquement.
                  </p>
                  <div className="tf-calendarSidebarActions">
                    <button
                      type="button"
                      className="tf-btn tf-btn--accent"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent("tf:navigateToCoaching", { detail: { topic: "with" } }));
                        setSelectedCalendarDateKey(null);
                        setIsCalendarOpen(false);
                      }}
                    >
                      RDV avec sujet
                    </button>
                    <button
                      type="button"
                      className="tf-btn"
                      onClick={() => {
                        trackFreeBookingClick();
                        openCalendlyWindow(freeBookingUrl);
                      }}
                      disabled={!isValidHttpUrl(freeBookingUrl)}
                    >
                      RDV sans sujet
                    </button>
                  </div>
                  <p className="tf-muted" style={{ margin: 0 }}>
                    Le détail du sujet se retrouve automatiquement dans le lien de réservation.
                  </p>
                </div>

                <div className="tf-card tf-card--flat tf-calendarPanel">
                  <h4 className="tf-title" style={{ margin: 0 }}>Ce mois-ci</h4>
                  <div className="tf-calendarStats">
                    <div className="tf-calendarStat">
                      <span className="tf-calendarStatLabel">Connexions</span>
                      <strong className="tf-title">{loginDaySet.size}</strong>
                    </div>
                    <div className="tf-calendarStat">
                      <span className="tf-calendarStatLabel">Séances à venir</span>
                      <strong className="tf-title">{calendarPlannedCount}</strong>
                    </div>
                    <div className="tf-calendarStat">
                      <span className="tf-calendarStatLabel">Séances faites</span>
                      <strong className="tf-title">{calendarCompletedCount}</strong>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>

          {selectedCalendarDateKey && (
            <div
              className="modal-backdrop tf-modalBackdrop"
              onClick={(event) => {
                event.stopPropagation();
                setSelectedCalendarDateKey(null);
              }}
            >
              <div
                className="modal-panel tf-modalPanel tf-card"
                onClick={(event) => event.stopPropagation()}
                style={{ width: "min(720px, 100%)", maxHeight: "80vh" }}
              >
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
                  <div className="tf-scroll" style={{ display: "grid", gap: 8, maxHeight: "60vh" }}>
                    {selectedDaySessions.map((session) => {
                      const hourLabel = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
                        new Date(parseDate(session.scheduled_at) ?? Date.now())
                      );
                      const isCompleted = session.status?.toLowerCase() === "completed";
                      const canReplan = !isCompleted && isValidHttpUrl(session.booking_url);

                      return (
                        <article key={session.id} className="card tf-card">
                          <p className="card-meta">
                            {hourLabel} · {isCompleted ? "Effectuée" : "Programmée"}
                          </p>
                          <h4 className="card-title tf-title">{session.theme ?? "Séance libre"}</h4>

                          {canReplan && (
                            <button
                              type="button"
                              className="btn btn-primary card-action"
                              onClick={() => openCalendlyWindow(resolveSessionBookingUrl(session))}
                            >
                              Replanifier
                            </button>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
