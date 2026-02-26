import { useEffect, useState } from "react";
import TasksWidget from "../components/TasksWidget";
import { supabase } from "../lib/supabase";

const CALENDLY_FREE_URL = "https://calendly.com/trustfinanceam/reserve-ton-appel-avec-matheo-aalberg-clone";

type SessionItem = {
  id: string;
  status: string | null;
  theme: string | null;
  objective: string | null;
  booking_url: string | null;
  scheduled_at: string | null;
  summary: string | null;
  recording_url: string | null;
  transcript: string | null;
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

function formatDate(dateValue: string | null) {
  const timestamp = parseDate(dateValue);
  if (timestamp === null) {
    return null;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function sortWithNullDatesLastAscending(a: SessionItem, b: SessionItem) {
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
}

function sortWithNullDatesLastDescending(a: SessionItem, b: SessionItem) {
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

  return timeB - timeA;
}

export default function SeancesPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSession, setActiveSession] = useState<SessionItem | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id,status,theme,objective,booking_url,scheduled_at,summary,recording_url,transcript")
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
    .filter((session) => session.status?.toLowerCase() === "planned")
    .sort(sortWithNullDatesLastAscending);
  const confirmedUpcomingSessions = upcomingSessions.filter((session) => {
    const scheduledAt = parseDate(session.scheduled_at);
    return scheduledAt !== null && scheduledAt >= now;
  });
  const sessionsToPlan = upcomingSessions.filter((session) => parseDate(session.scheduled_at) === null);

  const pastSessions = sessions
    .filter((session) => session.status?.toLowerCase() === "completed")
    .sort(sortWithNullDatesLastDescending);
  const activeSessionDate = activeSession ? formatDate(activeSession.scheduled_at) : null;

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
            <h4 className="subsection-title">Rendez-vous confirmés</h4>
            {confirmedUpcomingSessions.length === 0 && <div className="empty-state">Aucun rendez-vous confirmé pour le moment.</div>}

            {confirmedUpcomingSessions.length > 0 && (
              <div className="card-grid">
                {confirmedUpcomingSessions.map((session) => {
                  const formattedDate = formatDate(session.scheduled_at);

                  return (
                    <article key={session.id} className="card">
                      <p className="card-meta">{formattedDate}</p>
                      <h3 className="card-title">{session.theme ?? "Séance sans thème"}</h3>
                      <p className="card-text clamp-2">{session.objective ?? "Objectif non renseigné."}</p>

                      {session.booking_url ? (
                        <a href={session.booking_url} target="_blank" rel="noreferrer" className="btn btn-primary card-action">
                          Replanifier
                        </a>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}

            <h4 className="subsection-title">À planifier</h4>
            {sessionsToPlan.length === 0 && <div className="empty-state">Aucune séance à planifier.</div>}

            {sessionsToPlan.length > 0 && (
              <div className="card-grid">
                {sessionsToPlan.map((session) => (
                  <article key={session.id} className="card">
                    <h3 className="card-title">{session.theme ?? "Séance sans thème"}</h3>
                    <p className="card-text clamp-2">{session.objective ?? "Objectif non renseigné."}</p>

                    {session.booking_url ? (
                      <a href={session.booking_url} target="_blank" rel="noreferrer" className="btn btn-primary card-action">
                        Réserver
                      </a>
                    ) : (
                      <p className="card-meta card-action">Lien de réservation non disponible</p>
                    )}
                  </article>
                ))}
              </div>
            )}

            <div className="card free-session-card">
              <h4 className="card-title">Séance libre (sujet au choix)</h4>
              <p className="card-text">Réservez un créneau libre pour traiter votre besoin du moment.</p>
              <a href={CALENDLY_FREE_URL} target="_blank" rel="noreferrer" className="btn btn-primary card-action">
                Réserver
              </a>
            </div>

            <TasksWidget />
          </div>

          <div className="section-block">
            <h3 className="subsection-title">Passées</h3>
            {pastSessions.length === 0 && <div className="empty-state">Aucune séance passée.</div>}

            {pastSessions.length > 0 && (
              <div className="card-grid">
                {pastSessions.map((session) => {
                  const formattedDate = formatDate(session.scheduled_at);

                  return (
                    <button
                      key={session.id}
                      type="button"
                      className="card-button"
                      onClick={() => setActiveSession(session)}
                      aria-label={`Ouvrir la séance ${session.theme ?? "sans titre"}`}
                    >
                      {formattedDate && <p className="card-meta">{formattedDate}</p>}
                      <h3 className="card-title">{session.theme ?? "Séance sans thème"}</h3>
                      <p className="card-text clamp-2">{session.summary ?? "Aucun résumé."}</p>
                    </button>
                  );
                })}
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
                {activeSessionDate && <p className="modal-date">{activeSessionDate}</p>}
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
