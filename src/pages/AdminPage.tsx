import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type AdminUser = {
  id: string;
  email: string;
};

type AdminSession = {
  id: string;
  theme: string | null;
  status: string | null;
  scheduled_at: string | null;
};

type TaskPriority = "low" | "medium" | "high";

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string; className: string }> = [
  { value: "low", label: "Basse", className: "tf-adminPriorityPill--low" },
  { value: "medium", label: "Moyenne", className: "tf-adminPriorityPill--medium" },
  { value: "high", label: "Haute", className: "tf-adminPriorityPill--high" },
];

function formatSessionLabel(session: AdminSession) {
  const sessionName = session.theme?.trim() || "Séance libre (sujet au choix)";
  if (!session.scheduled_at) {
    return `${sessionName} — À programmer`;
  }

  const timestamp = Date.parse(session.scheduled_at);
  if (Number.isNaN(timestamp)) {
    return `${sessionName} — Date invalide`;
  }

  const label = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));

  return `${sessionName} — ${label}`;
}

export default function AdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [showUsersDropdown, setShowUsersDropdown] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showPilotageSoon, setShowPilotageSoon] = useState(false);
  const [pageMessage, setPageMessage] = useState("");
  const [pageError, setPageError] = useState("");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskError, setTaskError] = useState("");

  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [adminSessions, setAdminSessions] = useState<AdminSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [sessionSummary, setSessionSummary] = useState("");
  const [sessionTranscript, setSessionTranscript] = useState("");
  const [sessionSubmitting, setSessionSubmitting] = useState(false);
  const [sessionSubmitError, setSessionSubmitError] = useState("");

  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const filteredUsers = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) {
      return users;
    }

    return users.filter((user) => user.email.toLowerCase().includes(query));
  }, [searchValue, users]);

  const selectedUser = selectedUserId ? users.find((user) => user.id === selectedUserId) ?? null : null;
  const hasSelectedUser = Boolean(selectedUserId);

  async function getAccessToken() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new Error("Session expirée. Reconnecte-toi.");
    }
    return data.session.access_token;
  }

  async function adminFetch(path: string, init?: RequestInit) {
    const token = await getAccessToken();
    const response = await fetch(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
        authorization: `Bearer ${token}`,
      },
    });

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || payload?.ok === false) {
      const errorCode = typeof payload?.error === "string" ? payload.error : "request_failed";
      throw new Error(errorCode);
    }

    return payload;
  }

  async function loadAdminUsers() {
    setUsersLoading(true);
    setUsersError("");

    try {
      const payload = await adminFetch("/.netlify/functions/admin-users", { method: "GET" });
      const nextUsers = Array.isArray(payload?.users)
        ? payload.users
            .map((row) => {
              const user = row as Record<string, unknown>;
              const id = typeof user.id === "string" ? user.id : "";
              const email = typeof user.email === "string" ? user.email : "";
              return { id, email };
            })
            .filter((user) => user.id && user.email)
        : [];

      setUsers(nextUsers);
      if (!selectedUserId && nextUsers.length > 0) {
        setSelectedUserId(nextUsers[0].id);
        setSearchValue(nextUsers[0].email);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      setUsersError(`Impossible de charger les élèves : ${message}`);
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadSessionsForUser(targetUserId: string) {
    setSessionLoading(true);
    setSessionsError("");

    try {
      const payload = await adminFetch(`/.netlify/functions/admin-sessions-for-user?user_id=${encodeURIComponent(targetUserId)}`, {
        method: "GET",
      });

      const sourceRows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.sessions)
          ? payload.sessions
          : [];

      const nextSessions = Array.isArray(sourceRows)
        ? sourceRows
            .map((row) => {
              const session = row as Record<string, unknown>;
              return {
                id: typeof session.id === "string" ? session.id : "",
                theme: typeof session.theme === "string" ? session.theme : null,
                status: typeof session.status === "string" ? session.status : null,
                scheduled_at: typeof session.scheduled_at === "string" ? session.scheduled_at : null,
              } satisfies AdminSession;
            })
            .filter((session) => Boolean(session.id))
        : [];

      setAdminSessions(nextSessions);
      setSessionId((current) => current || nextSessions[0]?.id || "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      setSessionsError(`Impossible de charger les séances : ${message}`);
      setAdminSessions([]);
      setSessionId("");
    } finally {
      setSessionLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    (async () => {
      setCheckingAccess(true);
      setPageError("");
      setPageMessage("");

      const { data: userData, error: userError } = await supabase.auth.getUser();
      const currentUserId = userError ? null : userData.user?.id ?? null;
      if (!isMounted) {
        return;
      }

      if (!currentUserId) {
        setIsAdmin(false);
        setCheckingAccess(false);
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

      const canAccessAdmin = !profileError && profileData?.is_admin === true;
      setIsAdmin(canAccessAdmin);
      setCheckingAccess(false);

      if (!canAccessAdmin) {
        return;
      }

      await loadAdminUsers();
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!showUsersDropdown) {
      return;
    }

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".tf-adminSelectDropdown")) {
        return;
      }
      setShowUsersDropdown(false);
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
    };
  }, [showUsersDropdown]);

  useEffect(() => {
    if (!showSessionModal || !selectedUserId) {
      return;
    }

    void loadSessionsForUser(selectedUserId);
  }, [selectedUserId, showSessionModal]);

  function closeTaskModal() {
    setShowTaskModal(false);
    setTaskTitle("");
    setTaskPriority("medium");
    setTaskDueDate("");
    setTaskError("");
  }

  function closeSessionModal() {
    setShowSessionModal(false);
    setSessionSubmitError("");
    setSessionId("");
    setRecordingUrl("");
    setSessionSummary("");
    setSessionTranscript("");
    setSessionsError("");
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUserId) {
      setTaskError("Sélectionne un élève.");
      return;
    }
    if (!taskTitle.trim()) {
      setTaskError("Le titre est obligatoire.");
      return;
    }

    setTaskSubmitting(true);
    setTaskError("");

    try {
      await adminFetch("/.netlify/functions/admin-task-create", {
        method: "POST",
        body: JSON.stringify({
          target_user_id: selectedUserId,
          title: taskTitle.trim(),
          priority: taskPriority,
          due_date: taskDueDate.trim() || null,
        }),
      });

      setPageMessage("Tâche ajoutée avec succès.");
      setPageError("");
      closeTaskModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      setTaskError(`Impossible d'ajouter la tâche : ${message}`);
    } finally {
      setTaskSubmitting(false);
    }
  }

  async function handleCompleteSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUserId) {
      setSessionSubmitError("Sélectionne un élève.");
      return;
    }
    if (!sessionId) {
      setSessionSubmitError("Sélectionne une séance.");
      return;
    }
    if (!recordingUrl.trim()) {
      setSessionSubmitError("Le lien replay est obligatoire.");
      return;
    }
    if (!sessionSummary.trim()) {
      setSessionSubmitError("La synthèse est obligatoire.");
      return;
    }

    setSessionSubmitting(true);
    setSessionSubmitError("");

    try {
      await adminFetch("/.netlify/functions/admin-session-complete", {
        method: "POST",
        body: JSON.stringify({
          target_user_id: selectedUserId,
          session_id: sessionId,
          recording_url: recordingUrl.trim(),
          summary: sessionSummary.trim(),
          transcript: sessionTranscript.trim() || null,
        }),
      });

      setPageMessage("Séance validée avec succès.");
      setPageError("");
      closeSessionModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      setSessionSubmitError(`Impossible de valider la séance : ${message}`);
    } finally {
      setSessionSubmitting(false);
    }
  }

  if (checkingAccess) {
    return <p className="muted">Chargement de l'espace administrateur...</p>;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const isAccompagnementActive = location.pathname === "/" || location.pathname === "/stats";
  const isAdminActive = location.pathname === "/admin";

  return (
    <>
      <section className="tf-dashboard">
        <aside className="tf-sidebar tf-card tf-card--flat">
          <div className="tf-sidebarLogo">TF</div>
          <nav className="tf-sidebarMenu" aria-label="Navigation principale">
            <button
              type="button"
              className={`tf-sidebarItem${isAccompagnementActive ? " tf-sidebarItemActive" : ""}`}
              onClick={() => navigate("/")}
              aria-current={isAccompagnementActive ? "page" : undefined}
            >
              <span className="tf-sidebarIcon" aria-hidden="true">
                ◈
              </span>
              <span className="tf-sidebarLabel">Accompagnement</span>
            </button>

            <button type="button" className="tf-sidebarItem" onClick={() => setShowPilotageSoon(true)}>
              <span className="tf-sidebarIcon" aria-hidden="true">
                ◔
              </span>
              <span className="tf-sidebarLabel">Pilotage</span>
            </button>

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
          </nav>
        </aside>

        <main className="tf-dashboardMain">
          <div className="tf-card tf-card--flat tf-scroll" style={{ padding: 14 }}>
            <section className="tf-adminPage">
              <header className="tf-adminPageHeader">
                <div>
                  <h2 className="tf-title" style={{ margin: 0 }}>
                    Administrateur
                  </h2>
                  <p className="tf-subtitle" style={{ margin: "6px 0 0" }}>
                    Sélectionne un élève puis lance les actions de suivi.
                  </p>
                </div>
              </header>

              <section className="tf-adminSelectCard tf-card">
                <label className="tf-subtitle" htmlFor="admin-user-search">
                  Élève
                </label>
                <div className="tf-adminSelectDropdown" ref={dropdownRef}>
                  <input
                    id="admin-user-search"
                    type="text"
                    className="tf-adminInput"
                    placeholder="Rechercher un élève par email"
                    value={searchValue}
                    onFocus={() => setShowUsersDropdown(true)}
                    onChange={(event) => {
                      setSearchValue(event.target.value);
                      setShowUsersDropdown(true);
                    }}
                  />

                  {showUsersDropdown && (
                    <div className="tf-adminDropdownList">
                      {filteredUsers.length === 0 && <div className="tf-adminDropdownEmpty">Aucun élève trouvé.</div>}
                      {filteredUsers.map((user) => {
                        const isSelected = user.id === selectedUserId;
                        return (
                          <button
                            key={user.id}
                            type="button"
                            className={`tf-adminDropdownItem${isSelected ? " isActive" : ""}`}
                            onClick={() => {
                              setSelectedUserId(user.id);
                              setSearchValue(user.email);
                              setShowUsersDropdown(false);
                              setPageError("");
                              setPageMessage("");
                            }}
                          >
                            {user.email}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {usersLoading && <p className="tf-muted">Chargement des élèves...</p>}
                {usersError && <div className="error-box">{usersError}</div>}
                {selectedUser && !usersLoading && <p className="tf-muted">Élève sélectionné : {selectedUser.email}</p>}
              </section>

              <section className="tf-adminActionGrid">
                <article className="tf-adminActionCard tf-card">
                  <h3 className="tf-title" style={{ margin: 0 }}>
                    Ajouter une tâche
                  </h3>
                  <p className="tf-subtitle" style={{ margin: "6px 0 0" }}>
                    Crée une tâche personnalisée pour l&apos;élève sélectionné.
                  </p>
                  <button
                    type="button"
                    className="tf-adminCtaPrimary"
                    disabled={!hasSelectedUser}
                    onClick={() => {
                      setTaskError("");
                      setShowTaskModal(true);
                    }}
                  >
                    Ajouter une tâche
                  </button>
                </article>

                <article className="tf-adminActionCard tf-card">
                  <h3 className="tf-title" style={{ margin: 0 }}>
                    Séance terminée
                  </h3>
                  <p className="tf-subtitle" style={{ margin: "6px 0 0" }}>
                    Valide une séance et publie le replay et la synthèse.
                  </p>
                  <button
                    type="button"
                    className="tf-adminCtaPrimary tf-adminCtaPrimary--session"
                    disabled={!hasSelectedUser}
                    onClick={() => {
                      setSessionSubmitError("");
                      setShowSessionModal(true);
                    }}
                  >
                    Valider la séance
                  </button>
                </article>
              </section>

              {!hasSelectedUser && (
                <div className="tf-adminCenterMessage">
                  Sélectionne un élève pour activer les actions administrateur.
                </div>
              )}

              {pageMessage && <div className="empty-state">{pageMessage}</div>}
              {pageError && <div className="error-box">{pageError}</div>}
            </section>
          </div>
        </main>
      </section>

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

      {showTaskModal && (
        <div className="modal-backdrop tf-modalBackdrop" onClick={closeTaskModal}>
          <div
            className="modal-panel tf-modalPanel tf-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-task-title"
            onClick={(event) => event.stopPropagation()}
            style={{ width: "min(640px, 100%)", maxHeight: "90vh" }}
          >
            <div className="modal-header">
              <div>
                <h3 id="admin-task-title" className="modal-title tf-title">
                  Ajouter une tâche
                </h3>
              </div>
              <button type="button" className="btn" aria-label="Fermer" onClick={closeTaskModal}>
                ×
              </button>
            </div>

            <form onSubmit={(event) => void handleCreateTask(event)} className="tf-paneStack">
              <label className="tf-adminModalField">
                <span className="tf-subtitle">Titre</span>
                <input
                  type="text"
                  className="tf-adminInput"
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  placeholder="Titre de la tâche"
                  required
                />
              </label>

              <div className="tf-adminModalField">
                <span className="tf-subtitle">Priorité</span>
                <div className="tf-adminPriorityRow">
                  {PRIORITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`tf-adminPriorityPill ${option.className}${taskPriority === option.value ? " isActive" : ""}`}
                      onClick={() => setTaskPriority(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="tf-adminModalField">
                <span className="tf-subtitle">Date (optionnelle)</span>
                <input
                  type="date"
                  className="tf-adminInput"
                  value={taskDueDate}
                  onChange={(event) => setTaskDueDate(event.target.value)}
                />
              </label>

              {taskError && <div className="error-box">{taskError}</div>}

              <div className="tf-adminModalActions">
                <button type="button" className="tf-adminCtaSecondary" onClick={closeTaskModal} disabled={taskSubmitting}>
                  Annuler
                </button>
                <button type="submit" className="tf-adminCtaPrimary" disabled={taskSubmitting}>
                  {taskSubmitting ? "Validation..." : "Valider"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSessionModal && (
        <div className="modal-backdrop tf-modalBackdrop" onClick={closeSessionModal}>
          <div
            className="modal-panel tf-modalPanel tf-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-session-title"
            onClick={(event) => event.stopPropagation()}
            style={{ width: "min(760px, 100%)", maxHeight: "90vh" }}
          >
            <div className="modal-header">
              <div>
                <h3 id="admin-session-title" className="modal-title tf-title">
                  Séance terminée
                </h3>
              </div>
              <button type="button" className="btn" aria-label="Fermer" onClick={closeSessionModal}>
                ×
              </button>
            </div>

            <form onSubmit={(event) => void handleCompleteSession(event)} className="tf-paneStack">
              <label className="tf-adminModalField">
                <span className="tf-subtitle">Séance</span>
                <select
                  className="tf-adminInput"
                  value={sessionId}
                  onChange={(event) => setSessionId(event.target.value)}
                  disabled={sessionLoading || adminSessions.length === 0}
                  required
                >
                  <option value="">Sélectionner une séance</option>
                  {adminSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {formatSessionLabel(session)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="tf-adminModalField">
                <span className="tf-subtitle">Lien replay (embed)</span>
                <input
                  type="url"
                  className="tf-adminInput"
                  value={recordingUrl}
                  onChange={(event) => setRecordingUrl(event.target.value)}
                  placeholder="https://..."
                  required
                />
              </label>

              <label className="tf-adminModalField">
                <span className="tf-subtitle">Synthèse</span>
                <textarea
                  className="tf-adminTextarea"
                  value={sessionSummary}
                  onChange={(event) => setSessionSummary(event.target.value)}
                  placeholder="Points clés de la séance"
                  required
                />
              </label>

              <label className="tf-adminModalField">
                <span className="tf-subtitle">Transcription (optionnelle)</span>
                <textarea
                  className="tf-adminTextarea"
                  value={sessionTranscript}
                  onChange={(event) => setSessionTranscript(event.target.value)}
                  placeholder="Transcription de la séance"
                />
              </label>

              {sessionLoading && <p className="tf-muted">Chargement des séances...</p>}
              {sessionsError && <div className="error-box">{sessionsError}</div>}
              {sessionSubmitError && <div className="error-box">{sessionSubmitError}</div>}

              <div className="tf-adminModalActions">
                <button type="button" className="tf-adminCtaSecondary" onClick={closeSessionModal} disabled={sessionSubmitting}>
                  Annuler
                </button>
                <button type="submit" className="tf-adminCtaPrimary tf-adminCtaPrimary--session" disabled={sessionSubmitting}>
                  {sessionSubmitting ? "Validation..." : "Valider la séance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
