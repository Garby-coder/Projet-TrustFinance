import { useEffect, useState } from "react";
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

function getLessonTypeLabel(contentType: string | null) {
  return contentType?.toLowerCase() === "video" ? "Vidéo" : "Lecture";
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

  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState("");
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
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
        setMode("modules");
        setModules((modulesData ?? []) as ModuleItem[]);
        setModuleLessons((lessonsData ?? []) as ModuleLesson[]);
        setFallbackLessons([]);
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

      setQuizQuestions(structuredQuestions);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!isMounted) {
        return;
      }

      if (userError) {
        setQuizError("Impossible de récupérer l'utilisateur.");
        setLoadedQuizModuleId(activeModule.id);
        setQuizLoading(false);
        return;
      }

      if (userData.user?.id) {
        const { data: progressRows, error: progressError } = await supabase
          .from("module_quiz_progress")
          .select("passed")
          .eq("user_id", userData.user.id)
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

        setPassed(progressRows?.[0]?.passed === true);
      }

      setLoadedQuizModuleId(activeModule.id);
      setQuizLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, [activeTab, activeModule, loadedQuizModuleId]);

  const activeModuleLessons = activeModule
    ? moduleLessons.filter((lesson) => lesson.module_id === activeModule.id).sort((a, b) => a.order_index - b.order_index)
    : [];
  const activeLesson = activeModuleLessons.find((lesson) => lesson.id === activeLessonId) ?? activeModuleLessons[0] ?? null;

  function openModule(module: ModuleItem) {
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

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user?.id) {
      setQuizSubmitMessage("Impossible d'identifier l'utilisateur.");
      setQuizSubmitting(false);
      return;
    }

    const nowIso = new Date().toISOString();
    const { error: upsertError } = await supabase.from("module_quiz_progress").upsert(
      {
        user_id: userData.user.id,
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
    setQuizSubmitMessage("Quiz réussi.");
    setQuizSubmitting(false);
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
          {modules.map((module) => (
            <button
              key={module.id}
              type="button"
              className="card-button"
              onClick={() => openModule(module)}
              aria-label={`Ouvrir le module ${module.title}`}
            >
              <p className="card-meta">Module {module.order_index}</p>
              <h3 className="card-title">{module.title}</h3>
              <p className="card-text clamp-2">{module.description ?? "Aucune description."}</p>
              <p className="card-meta" style={{ marginTop: 10 }}>
                {getLessonCount(module.id)} leçon(s)
              </p>
            </button>
          ))}
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
                          {question.choices.map((choice) => (
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
          </div>
        </div>
      )}

      {mode === "fallback" && activeFallbackLesson && (
        <div className="modal-backdrop" onClick={() => setActiveFallbackLesson(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
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
