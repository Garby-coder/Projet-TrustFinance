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

function isMissingModulesTable(error: { code?: string; message: string }) {
  const message = error.message.toLowerCase();
  return error.code === "42P01" || (message.includes("does not exist") && message.includes("modules"));
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
  const [fallbackLessons, setFallbackLessons] = useState<FallbackLesson[]>([]);
  const [activeFallbackLesson, setActiveFallbackLesson] = useState<FallbackLesson | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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

  const activeModuleLessons = activeModule
    ? moduleLessons.filter((lesson) => lesson.module_id === activeModule.id).sort((a, b) => a.order_index - b.order_index)
    : [];
  const activeLesson = activeModuleLessons.find((lesson) => lesson.id === activeLessonId) ?? activeModuleLessons[0] ?? null;

  function openModule(module: ModuleItem) {
    const lessons = moduleLessons.filter((lesson) => lesson.module_id === module.id).sort((a, b) => a.order_index - b.order_index);
    setActiveModule(module);
    setActiveLessonId(lessons[0]?.id ?? null);
  }

  function getLessonCount(moduleId: string) {
    return moduleLessons.filter((lesson) => lesson.module_id === moduleId).length;
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
        <div
          className="modal-backdrop"
          onClick={() => {
            setActiveModule(null);
            setActiveLessonId(null);
          }}
        >
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="card-meta">Module</p>
                <h3 className="modal-title">{activeModule.title}</h3>
                {activeModule.description && <p className="card-text">{activeModule.description}</p>}
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setActiveModule(null);
                  setActiveLessonId(null);
                }}
              >
                Fermer
              </button>
            </div>

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
