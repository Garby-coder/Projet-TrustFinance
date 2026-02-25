import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type SessionItem = {
  id: string;
  theme: string | null;
  scheduled_at: string | null;
  summary: string | null;
  recording_url: string | null;
  transcript: string | null;
};

function parseDate(dateValue: string | null) {
  if (!dateValue) {
    return Number.NaN;
  }

  return Date.parse(dateValue);
}

function formatDate(dateValue: string | null) {
  const timestamp = parseDate(dateValue);
  if (Number.isNaN(timestamp)) {
    return "Date non renseignée";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export default function SeancesPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSession, setActiveSession] = useState<SessionItem | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [referenceTime] = useState(() => Date.now());

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id,theme,scheduled_at,summary,recording_url,transcript")
        .order("scheduled_at", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (error) {
        setError(error.message);
      } else {
        setSessions(data ?? []);
      }

      setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const upcomingSessions = sessions
    .filter((session) => {
      const scheduledAt = parseDate(session.scheduled_at);
      return !Number.isNaN(scheduledAt) && scheduledAt >= referenceTime;
    })
    .sort((a, b) => parseDate(a.scheduled_at) - parseDate(b.scheduled_at));

  const pastSessions = sessions
    .filter((session) => {
      const scheduledAt = parseDate(session.scheduled_at);
      return Number.isNaN(scheduledAt) || scheduledAt < referenceTime;
    })
    .sort((a, b) => parseDate(b.scheduled_at) - parseDate(a.scheduled_at));

  return (
    <section>
      <h2 className="section-title">Mes séances</h2>
      <p className="section-subtitle">Historique et prochains rendez-vous.</p>

      {error && <div className="error-box">Erreur Supabase: {error}</div>}
      {loading && <p className="muted">Chargement...</p>}

      {!loading && sessions.length === 0 && <div className="empty-state">Aucune séance pour le moment.</div>}

      {!loading && sessions.length > 0 && (
        <>
          <div className="section-block">
            <h3 className="subsection-title">À venir</h3>
            {upcomingSessions.length === 0 && <div className="empty-state">Aucune séance à venir.</div>}

            {upcomingSessions.length > 0 && (
              <div className="card-grid">
                {upcomingSessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    className="card-button"
                    onClick={() => setActiveSession(session)}
                    aria-label={`Ouvrir la séance ${session.theme ?? "sans titre"}`}
                  >
                    <p className="card-meta">{formatDate(session.scheduled_at)}</p>
                    <h3 className="card-title">{session.theme ?? "Séance sans thème"}</h3>
                    <p className="card-text clamp-2">{session.summary ?? "Aucun résumé."}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="section-block">
            <h3 className="subsection-title">Passées</h3>
            {pastSessions.length === 0 && <div className="empty-state">Aucune séance passée.</div>}

            {pastSessions.length > 0 && (
              <div className="card-grid">
                {pastSessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    className="card-button"
                    onClick={() => setActiveSession(session)}
                    aria-label={`Ouvrir la séance ${session.theme ?? "sans titre"}`}
                  >
                    <p className="card-meta">{formatDate(session.scheduled_at)}</p>
                    <h3 className="card-title">{session.theme ?? "Séance sans thème"}</h3>
                    <p className="card-text clamp-2">{session.summary ?? "Aucun résumé."}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeSession && (
        <div className="modal-backdrop" onClick={() => setActiveSession(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{activeSession.theme ?? "Séance sans thème"}</h3>
                <p className="modal-date">{formatDate(activeSession.scheduled_at)}</p>
              </div>
              <button type="button" className="btn" onClick={() => setActiveSession(null)}>
                Fermer
              </button>
            </div>

            <div className="modal-section">
              <h4>Résumé</h4>
              <p className="card-text preserve-line-breaks">{activeSession.summary ?? "Aucun résumé."}</p>
            </div>

            {activeSession.recording_url && (
              <div className="modal-section">
                <a href={activeSession.recording_url} target="_blank" rel="noreferrer" className="btn btn-primary">
                  Ouvrir l'enregistrement
                </a>
              </div>
            )}

            {activeSession.transcript && (
              <div className="modal-section">
                <h4>Transcription</h4>
                <p className="card-text preserve-line-breaks">{activeSession.transcript}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
