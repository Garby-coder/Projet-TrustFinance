import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { registerEngagementAction } from "../lib/engagement";

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

type FallbackLesson = {
  id: string;
  module: string | null;
  title: string;
  order_index: number;
  duration_min: number | null;
  tella_url: string | null;
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

export default function FormationPage() {
  const [mode, setMode] = useState<"modules" | "fallback">("modules");
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [moduleLessons, setModuleLessons] = useState<ModuleLesson[]>([]);
  const [activeModule, setActiveModule] = useState<ModuleItem | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"lessons" | "quiz">("lessons");
  const [fallbackLessons, setFallbackLessons] = useState<FallbackLesson[]>([]);
  const [activeFallbackLesson, setActiveFallbackLesson] = useState<FallbackLesson | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [completedByLessonId, setCompletedByLessonId] = useState<Record<string, boolean>>({});
  const [lessonProgressMessage, setLessonProgressMessage] = useState("");
  const [lessonProgressSubmittingId, setLessonProgressSubmittingId] = useState<string | null>(null);
  const [passedByModuleId, setPassedByModuleId] = useState<Record<string, boolean>>({});
  const [quizRequiredByModuleId, setQuizRequiredByModuleId] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const { data: modulesData, error: modulesError } = await supabase
        .from("modules")
        .select("id,title,description,order_index,is_published")
        .eq("is_published", true)
        .order("order_index", { ascending: true });

      if (modulesError) {
        if (isMissingModulesTable(modulesError)) {
          const { data: lessonsData, error: lessonsError } = await supabase
            .from("lessons")
            .select("id,module,title,order_index,duration_min,tella_url")
            .order("order_index", { ascending: true });

          if (!isMounted) {
            return;
          }

          if (lessonsError) {
            setError(lessonsError.message);
          } else {
            setMode("fallback");
            setFallbackLessons((lessonsData ?? []) as FallbackLesson[]);
            setModules([]);
            setModuleLessons([]);
            setUserId(null);
            setCompletedByLessonId({});
            setLessonProgressMessage("");
            setLessonProgressSubmittingId(null);
            setPassedByModuleId({});
            setQuizRequiredByModuleId({});
          }

          setLoading(false);
          return;
        }

        if (isMounted) {
          setError(modulesError.message);
          setLoading(false);
        }
        return;
      }

      const { data: lessonsData, error: lessonsError } = await supabase
        .from("lessons")
        .select("id,module_id,title,order_index,duration_min,content_type,tella_url,content_markdown,is_published")
        .eq("is_published", true)
        .order("order_index", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (lessonsError) {
        setError(lessonsError.message);
      } else {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (!isMounted) {
          return;
        }

        const currentUserId = userError ? null : (userData.user?.id ?? null);
        const nextCompletedByLessonId: Record<string, boolean> = {};
        const nextPassedByModuleId: Record<string, boolean> = {};
        const nextQuizRequiredByModuleId: Record<string, boolean> = {};
        const moduleRows = (modulesData ?? []) as ModuleItem[];
        const moduleIds = moduleRows.map((module) => module.id);

        if (currentUserId) {
          const { data: lessonProgressRows, error: lessonProgressError } = await supabase
            .from("lesson_progress")
            .select("lesson_id")
            .eq("user_id", currentUserId);

          if (!isMounted) {
            return;
          }

          if (lessonProgressError) {
            if (!isMissingLessonProgressTable(lessonProgressError)) {
              setError(lessonProgressError.message);
            }
          } else {
            const rows = (lessonProgressRows ?? []) as Array<{ lesson_id: string | null }>;
            for (const row of rows) {
              if (row.lesson_id) {
                nextCompletedByLessonId[row.lesson_id] = true;
              }
            }
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
              setError(progressError.message);
            }
          } else {
            const rows = (progressRows ?? []) as Array<{ module_id: string | null; passed: boolean | null }>;
            for (const row of rows) {
              if (row.module_id && row.passed === true) {
                nextPassedByModuleId[row.module_id] = true;
              }
            }
          }
        }

        if (moduleIds.length > 0) {
          const { data: moduleQuizRows, error: moduleQuizRowsError } = await supabase
            .from("module_quizzes")
            .select("module_id,is_published")
            .in("module_id", moduleIds);

          if (!isMounted) {
            return;
          }

          if (moduleQuizRowsError) {
            if (!isMissingQuizTable(moduleQuizRowsError)) {
              setError(moduleQuizRowsError.message);
            }
          } else {
            const rows = (moduleQuizRows ?? []) as Array<{ module_id: string | null; is_published: boolean | null }>;
            for (const row of rows) {
              if (row.module_id && row.is_published === true) {
                nextQuizRequiredByModuleId[row.module_id] = true;
              }
            }
          }
        }

        setMode("modules");
        setModules(moduleRows);
        setModuleLessons((lessonsData ?? []) as ModuleLesson[]);
        setFallbackLessons([]);
        setUserId(currentUserId);
        setCompletedByLessonId(nextCompletedByLessonId);
        setLessonProgressMessage("");
        setLessonProgressSubmittingId(null);
        setPassedByModuleId(nextPassedByModuleId);
        setQuizRequiredByModuleId(nextQuizRequiredByModuleId);
      }

      setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

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

  const activeModuleLessons = activeModule
    ? moduleLessons.filter((lesson) => lesson.module_id === activeModule.id).sort((a, b) => a.order_index - b.order_index)
    : [];
  const activeLesson = activeModuleLessons.find((lesson) => lesson.id === activeLessonId) ?? activeModuleLessons[0] ?? null;
  const isActiveLessonCompleted = activeLesson ? completedByLessonId[activeLesson.id] === true : false;
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

  const isActiveModuleUnlocked = activeModule ? unlockedByModuleId[activeModule.id] === true : false;

  function openModule(module: ModuleItem) {
    if (unlockedByModuleId[module.id] !== true) {
      return;
    }

    const lessons = moduleLessons.filter((lesson) => lesson.module_id === module.id).sort((a, b) => a.order_index - b.order_index);
    setActiveModule(module);
    setActiveLessonId(lessons[0]?.id ?? null);
    setActiveTab("lessons");
    setLoadedQuizModuleId(null);
  }

  function closeModuleModal() {
    setActiveModule(null);
    setActiveLessonId(null);
    setActiveTab("lessons");
    setQuizSubmitMessage("");
  }

  function getLessonCount(moduleId: string) {
    return moduleLessons.filter((lesson) => lesson.module_id === moduleId).length;
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
      <h2 className="section-title">Ma formation</h2>
      <p className="section-subtitle">Leçons publiées, classées par ordre.</p>

      {error && <div className="error-box">Erreur Supabase: {error}</div>}
      {loading && <p className="muted">Chargement...</p>}

      {!loading && mode === "modules" && modules.length === 0 && <div className="empty-state">Aucun module disponible.</div>}
      {!loading && mode === "fallback" && fallbackLessons.length === 0 && <div className="empty-state">Aucune leçon disponible.</div>}

      {!loading && mode === "modules" && modules.length > 0 && (
        <div className="card-grid">
          {modulesSorted.map((module) => {
            const isUnlocked = unlockedByModuleId[module.id] === true;

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
                <h3 className="card-title">{module.title}</h3>
                <p className="card-text clamp-2">{module.description ?? "Aucune description."}</p>
                <p className="card-meta" style={{ marginTop: 10 }}>
                  {getLessonCount(module.id)} leçon(s)
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

      {!loading && mode === "fallback" && fallbackLessons.length > 0 && (
        <div className="card-grid">
          {fallbackLessons.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              className="card-button"
              onClick={() => setActiveFallbackLesson(lesson)}
              aria-label={`Ouvrir la leçon ${lesson.title}`}
            >
              <p className="card-meta">{lesson.module ?? "Module"}</p>
              <h3 className="card-title">{lesson.title}</h3>
              <p className="card-meta">
                Ordre {lesson.order_index}
                {lesson.duration_min ? ` · ${lesson.duration_min} min` : ""}
              </p>
            </button>
          ))}
        </div>
      )}

      {mode === "modules" && activeModule && (
        <div className="modal-backdrop tf-modalBackdrop" onClick={closeModuleModal}>
          <div className="modal-panel tf-modalPanel" onClick={(event) => event.stopPropagation()}>
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

            {!isActiveModuleUnlocked && (
              <div className="empty-state">Verrouillé — valide le quiz du module précédent.</div>
            )}

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

                        {(typeof activeLesson.tella_url === "string" && activeLesson.tella_url.trim().length > 0) && (
                          <div className="modal-video">
                            <iframe
                              src={activeLesson.tella_url}
                              title={activeLesson.title}
                              allow="autoplay; fullscreen; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        )}

                        {(typeof activeLesson.content_markdown === "string" && activeLesson.content_markdown.trim().length > 0) && (
                          <p className="card-text" style={{ whiteSpace: "pre-wrap" }}>
                            {activeLesson.content_markdown}
                          </p>
                        )}

                        {(!activeLesson.tella_url || activeLesson.tella_url.trim().length === 0) &&
                          (!activeLesson.content_markdown || activeLesson.content_markdown.trim().length === 0) && (
                            <div className="empty-state">Contenu indisponible pour cette leçon.</div>
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
                    {!quizLoading && !quizError && (quizUnavailable || quizQuestions.length === 0) && (
                      <div className="empty-state">Quiz non disponible.</div>
                    )}

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

      {mode === "fallback" && activeFallbackLesson && (
        <div className="modal-backdrop tf-modalBackdrop" onClick={() => setActiveFallbackLesson(null)}>
          <div className="modal-panel tf-modalPanel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="card-meta">{activeFallbackLesson.module ?? "Module"}</p>
                <h3 className="modal-title">{activeFallbackLesson.title}</h3>
              </div>
              <button type="button" className="btn" onClick={() => setActiveFallbackLesson(null)}>
                Fermer
              </button>
            </div>

            {activeFallbackLesson.tella_url ? (
              <div className="modal-video">
                <iframe
                  src={activeFallbackLesson.tella_url}
                  title={activeFallbackLesson.title}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="empty-state">Vidéo indisponible pour cette leçon.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
