import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Lesson = {
  id: string;
  module: string;
  title: string;
  order_index: number;
  duration_min: number | null;
  tella_url: string;
};

export default function LessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [error, setError] = useState<string>("");
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("id,module,title,order_index,duration_min,tella_url")
        .order("order_index", { ascending: true });

      if (error) setError(error.message);
      else setLessons(data ?? []);
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    location.reload();
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Leçons</h2>
        <button onClick={signOut}>Se déconnecter</button>
      </div>

      {error && (
        <div style={{ padding: 12, background: "#fee", border: "1px solid #fbb", borderRadius: 10, marginTop: 16 }}>
          Erreur Supabase : {error}
        </div>
      )}

      <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
        {lessons.map((l) => (
          <button
            key={l.id}
            onClick={() => setActiveLesson(l)}
            style={{
              textAlign: "left",
              padding: 16,
              border: "1px solid #ddd",
              borderRadius: 14,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.7 }}>{l.module}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{l.title}</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
              Durée : {l.duration_min ?? "?"} min — Ordre : {l.order_index}
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: "#111" }}>▶ Ouvrir la leçon</div>
          </button>
        ))}
      </div>

      {/* MODAL LECTURE */}
      {activeLesson && (
        <div
          onClick={() => setActiveLesson(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(980px, 100%)",
              background: "#fff",
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{activeLesson.module}</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{activeLesson.title}</div>
              </div>
              <button onClick={() => setActiveLesson(null)}>Fermer</button>
            </div>

            <div style={{ marginTop: 14, position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden" }}>
              <iframe
                src={activeLesson.tella_url}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}