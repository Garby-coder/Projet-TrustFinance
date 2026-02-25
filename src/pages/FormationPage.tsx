import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Lesson = {
  id: string;
  module: string | null;
  title: string;
  order_index: number;
  duration_min: number | null;
  tella_url: string;
};

export default function FormationPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("id,module,title,order_index,duration_min,tella_url")
        .order("order_index", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (error) {
        setError(error.message);
      } else {
        setLessons(data ?? []);
      }

      setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section>
      <h2 className="section-title">Ma formation</h2>
      <p className="section-subtitle">Leçons publiées, classées par ordre.</p>

      {error && <div className="error-box">Erreur Supabase: {error}</div>}
      {loading && <p className="muted">Chargement...</p>}

      {!loading && lessons.length === 0 && <div className="empty-state">Aucune leçon disponible.</div>}

      {!loading && lessons.length > 0 && (
        <div className="card-grid">
          {lessons.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              className="card-button"
              onClick={() => setActiveLesson(lesson)}
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

      {activeLesson && (
        <div className="modal-backdrop" onClick={() => setActiveLesson(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="card-meta">{activeLesson.module ?? "Module"}</p>
                <h3 className="modal-title">{activeLesson.title}</h3>
              </div>
              <button type="button" className="btn" onClick={() => setActiveLesson(null)}>
                Fermer
              </button>
            </div>

            <div className="modal-video">
              <iframe
                src={activeLesson.tella_url}
                title={activeLesson.title}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
