import { useEffect, useState } from "react";
import TasksWidget from "../components/TasksWidget";
import { supabase } from "../lib/supabase";

const CALENDLY_FREE_URL = "https://calendly.com/trustfinanceam/reserve-ton-appel-avec-matheo-aalberg-clone";

type SessionItem = {
  id: string;
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

function isOrderIndexMissingColumnError(errorMessage: string) {
  const normalizedMessage = errorMessage.toLowerCase();
  return (
    normalizedMessage.includes("order_index") &&
    (normalizedMessage.includes("column") || normalizedMessage.includes("does not exist"))
  );
}

function sortByProgressOrder(a: SessionItem, b: SessionItem) {
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

function isValidRecordingUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export default function SeancesPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSession, setActiveSession] = useState<SessionItem | null>(null);
  const [showRecording, setShowRecording] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lockingEnabled, setLockingEnabled] = useState(true);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let isMounted = true;

    (async () => {
      setError("");

      const primarySelect =
        "id,status,order_index,created_at,theme,objective,booking_url,scheduled_at,summary,recording_url,transcript";
      const fallbackSelect =
        "id,status,created_at,theme,objective,booking_url,scheduled_at,summary,recording_url,transcript";

      let disableLocking = false;
      let { data, error } = await supabase
        .from("sessions")
        .select(primarySelect)
        .order("scheduled_at", { ascending: true });

      if (error && isOrderIndexMissingColumnError(error.message)) {
        disableLocking = true;
        const fallbackResponse = await supabase.from("sessions").select(fallbackSelect).order("scheduled_at", { ascending: true });
        data = fallbackResponse.data as SessionItem[] | null;
        error = fallbackResponse.error;
      }

      if (!isMounted) {
        return;
      }

      if (error) {
        setError(error.message);
        setLockingEnabled(false);
      } else {
        const normalizedSessions = disableLocking
          ? ((data ?? []) as Array<Omit<SessionItem, "order_index">>).map((session) => ({ ...session, order_index: null }))
          : ((data ?? []) as SessionItem[]);

        setSessions(normalizedSessions);
        setLockingEnabled(!disableLocking);
      }

      setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setShowRecording(false);
  }, [activeSession?.id]);

  const upcomingSessions = sessions
    .filter((session) => session.status?.toLowerCase() === "planned")
    .sort(sortWithNullDatesLastAscending);
  const confirmedUpcomingSessions = upcomingSessions.filter((session) => {
    const scheduledAt = parseDate(session.scheduled_at);
    return scheduledAt !== null && scheduledAt >= now;
  });
  const sessionsToPlan = upcomingSessions.filter((session) => parseDate(session.scheduled_at) === null);
  const sessionsByOrder = [...sessions].sort(sortByProgressOrder);
  const nextRequired = sessionsByOrder.find((session) => session.status?.toLowerCase() !== "completed");
  const nextRequiredId = lockingEnabled ? (nextRequired?.id ?? null) : null;

  function isUnlocked(session: SessionItem) {
    if (!lockingEnabled) {
      return true;
    }
    if (session.status?.toLowerCase() === "completed") {
      return true;
    }
    if (!nextRequiredId) {
      return true;
    }

    return session.id === nextRequiredId;
  }

  function isLockedPlanned(session: SessionItem) {
    return session.status?.toLowerCase() === "planned" && !isUnlocked(session);
  }

  const pastSessions = sessions
    .filter((session) => session.status?.toLowerCase() === "completed")
    .sort(sortWithNullDatesLastDescending);
  const activeSessionDate = activeSession ? formatDate(activeSession.scheduled_at) : null;
  const activeRecordingUrl = activeSession?.recording_url?.trim() ?? "";
  const hasRecordingUrl = activeRecordingUrl.length > 0;
  const canEmbedRecording = hasRecordingUrl && isValidRecordingUrl(activeRecordingUrl);

  function closeActiveSessionModal() {
    setShowRecording(false);
    setActiveSession(null);
  }

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

                      {session.booking_url && !isLockedPlanned(session) ? (
                        <a href={session.booking_url} target="_blank" rel="noreferrer" className="btn btn-primary card-action">
                          Replanifier
                        </a>
                      ) : isLockedPlanned(session) ? (
                        <p className="card-meta card-action">Verrouillé — termine la séance précédente</p>
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

                    {session.booking_url && !isLockedPlanned(session) ? (
                      <a href={session.booking_url} target="_blank" rel="noreferrer" className="btn btn-primary card-action">
                        Réserver
                      </a>
                    ) : isLockedPlanned(session) ? (
                      <p className="card-meta card-action">Verrouillé — termine la séance précédente</p>
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
        <div className="modal-backdrop" onClick={closeActiveSessionModal}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{activeSession.theme ?? "Séance sans thème"}</h3>
                {activeSessionDate && <p className="modal-date">{activeSessionDate}</p>}
              </div>
              <button type="button" className="btn" onClick={closeActiveSessionModal}>
                Fermer
              </button>
            </div>

            <div className="modal-section">
              <h4>Résumé</h4>
              <p className="card-text preserve-line-breaks">{activeSession.summary ?? "Aucun résumé."}</p>
            </div>

            {hasRecordingUrl && (
              <div className="modal-section">
                <button type="button" className="btn btn-primary" onClick={() => setShowRecording((current) => !current)}>
                  {showRecording ? "Masquer l'enregistrement" : "Afficher l'enregistrement"}
                </button>

                {showRecording && (
                  <div style={{ marginTop: 12 }}>
                    {canEmbedRecording ? (
                      <div style={{ width: "100%", aspectRatio: "16 / 9" }}>
                        <iframe
                          src={activeRecordingUrl}
                          title="Enregistrement de la séance"
                          style={{ width: "100%", height: "100%", border: 0 }}
                          allowFullScreen
                        />
                      </div>
                    ) : (
                      <p className="card-text">Lien d’enregistrement invalide.</p>
                    )}
                  </div>
                )}
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
