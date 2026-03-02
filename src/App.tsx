import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import "./styles/make-dashboard.css";

import ProtectedLayout from "./components/ProtectedLayout";
import { supabase } from "./lib/supabase";
import { ensureDefaultsForUser } from "./lib/bootstrap";

import Login from "./pages/Login";
import StatsPage from "./pages/StatsPage";

type UserEngagement = {
  user_id: string;
  onboarding_done: boolean | null;
  cadence_unit: string | null;
  cadence_target: number | null;
};

type CadenceOption = {
  id: "daily" | "three-per-week" | "once-per-week";
  label: string;
  cadence_unit: "day" | "week";
  cadence_target: number;
};

const CADENCE_OPTIONS: CadenceOption[] = [
  { id: "daily", label: "Tous les jours", cadence_unit: "day", cadence_target: 1 },
  { id: "three-per-week", label: "3 fois par semaine", cadence_unit: "week", cadence_target: 3 },
  { id: "once-per-week", label: "1 fois par semaine", cadence_unit: "week", cadence_target: 1 },
];

function getCadenceSelection(engagement: UserEngagement | null): CadenceOption["id"] {
  if (!engagement) {
    return "once-per-week";
  }

  if (engagement.cadence_unit === "day" && engagement.cadence_target === 1) {
    return "daily";
  }

  if (engagement.cadence_unit === "week" && engagement.cadence_target === 3) {
    return "three-per-week";
  }

  return "once-per-week";
}

function isMissingUserEngagementTable(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as { code?: string; message?: string };
  const message = err.message?.toLowerCase() ?? "";
  return err.code === "42P01" || message.includes("relation") && message.includes("user_engagement") && message.includes("does not exist");
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [selectedCadenceId, setSelectedCadenceId] = useState<CadenceOption["id"]>("once-per-week");
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [onboardingDisabled, setOnboardingDisabled] = useState(false);
  const didBootstrap = useRef(false);
  const selectedCadence =
    CADENCE_OPTIONS.find((option) => option.id === selectedCadenceId) ?? CADENCE_OPTIONS[CADENCE_OPTIONS.length - 1];

  async function fetchUserEngagementRow(currentUserId: string) {
    const result = await supabase
      .from("user_engagement")
      .select("user_id,onboarding_done,cadence_unit,cadence_target")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return result.data as UserEngagement | null;
  }

  // 1) Suivre la session auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthed(Boolean(data.session));
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(Boolean(session));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // 2) Initialiser tâches + séances une seule fois après login
  useEffect(() => {
    let isMounted = true;

    (async () => {
      if (!isAuthed) {
        didBootstrap.current = false;
        if (isMounted) {
          setUserId(null);
          setBootstrapReady(false);
          setShowOnboardingModal(false);
          setOnboardingError("");
          setOnboardingDisabled(false);
        }
        return;
      }

      if (didBootstrap.current) {
        return;
      }

      didBootstrap.current = true;
      if (isMounted) {
        setBootstrapReady(false);
      }

      const { data, error } = await supabase.auth.getUser();
      if (error) {
        if (isMounted) {
          setBootstrapReady(true);
        }
        return;
      }

      const userId = data.user?.id;
      if (!userId) {
        if (isMounted) {
          setBootstrapReady(true);
        }
        return;
      }

      if (isMounted) {
        setUserId(userId);
      }

      try {
        await ensureDefaultsForUser(userId);
      } catch {
        // optionnel: console.error(e)
      } finally {
        if (isMounted) {
          setBootstrapReady(true);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isAuthed]);

  // 3) Charger onboarding global
  useEffect(() => {
    let isMounted = true;

    (async () => {
      if (!isAuthed || !bootstrapReady || !userId || onboardingDisabled) {
        if (!isAuthed && isMounted) {
          setShowOnboardingModal(false);
          setOnboardingLoading(false);
          setOnboardingError("");
        }
        return;
      }

      setOnboardingLoading(true);
      setOnboardingError("");

      try {
        let engagement = await fetchUserEngagementRow(userId);

        if (!engagement) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          engagement = await fetchUserEngagementRow(userId);
        }

        if (!isMounted) {
          return;
        }

        if (!engagement) {
          setShowOnboardingModal(false);
          setOnboardingError("Impossible de charger ton rythme pour le moment.");
          return;
        }

        setSelectedCadenceId(getCadenceSelection(engagement));
        setShowOnboardingModal(engagement.onboarding_done !== true);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (isMissingUserEngagementTable(error)) {
          setOnboardingDisabled(true);
          setShowOnboardingModal(false);
          setOnboardingError("");
          return;
        }

        setShowOnboardingModal(false);
        setOnboardingError("Impossible de charger ton rythme pour le moment.");
      } finally {
        if (isMounted) {
          setOnboardingLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isAuthed, bootstrapReady, userId, onboardingDisabled]);

  async function handleValidateOnboarding() {
    if (!userId) {
      setOnboardingError("Utilisateur introuvable.");
      return;
    }

    setSavingOnboarding(true);
    setOnboardingError("");

    const updatePayload = {
      cadence_unit: selectedCadence.cadence_unit,
      cadence_target: selectedCadence.cadence_target,
      onboarding_done: true,
      last_period_key: null,
      period_progress: 0,
      streak_current: 0,
      streak_best: 0,
    };

    try {
      const firstUpdate = await supabase
        .from("user_engagement")
        .update(updatePayload)
        .eq("user_id", userId)
        .select("user_id")
        .maybeSingle();

      if (firstUpdate.error) {
        throw firstUpdate.error;
      }

      if (!firstUpdate.data) {
        await ensureDefaultsForUser(userId);

        const secondUpdate = await supabase
          .from("user_engagement")
          .update(updatePayload)
          .eq("user_id", userId)
          .select("user_id")
          .maybeSingle();

        if (secondUpdate.error) {
          throw secondUpdate.error;
        }

        if (!secondUpdate.data) {
          throw new Error("Ligne user_engagement introuvable.");
        }
      }

      setShowOnboardingModal(false);
    } catch (error) {
      if (isMissingUserEngagementTable(error)) {
        setOnboardingDisabled(true);
        setShowOnboardingModal(false);
        setOnboardingError("");
        return;
      }

      setOnboardingError("Impossible d'enregistrer ton rythme. Réessaie.");
    } finally {
      setSavingOnboarding(false);
    }
  }

  // 4) UI loading (après les hooks, ok)
  if (loading) {
    return (
      <div className="tf-app">
        <div className="app-shell">
          <p className="muted">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tf-app">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={isAuthed ? <Navigate to="/" replace /> : <Login />} />

          <Route path="/" element={isAuthed ? <ProtectedLayout /> : <Navigate to="/login" replace />}>
            <Route index element={<StatsPage />} />
            <Route path="seances" element={<Navigate to="/" replace />} />
            <Route path="formation" element={<Navigate to="/" replace />} />
          </Route>

          <Route path="*" element={<Navigate to={isAuthed ? "/" : "/login"} replace />} />
        </Routes>

        {isAuthed && onboardingLoading && !showOnboardingModal && <p className="muted">Chargement de ton rythme...</p>}
        {isAuthed && onboardingError && !showOnboardingModal && <div className="error-box">{onboardingError}</div>}

        {isAuthed && showOnboardingModal && (
          <div className="modal-backdrop">
            <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="global-cadence-onboarding-title">
              <div className="modal-header">
                <div>
                  <h3 id="global-cadence-onboarding-title" className="modal-title">
                    Configurer ton rythme (30 sec)
                  </h3>
                  <p className="card-text">Pour adapter tes streaks et objectifs.</p>
                </div>
              </div>

              <div className="modal-section">
                <h4>À quelle fréquence peux-tu avancer ici ?</h4>
                <div style={{ display: "grid", gap: 8 }}>
                  {CADENCE_OPTIONS.map((option) => {
                    const isSelected = option.id === selectedCadenceId;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className="btn"
                        onClick={() => setSelectedCadenceId(option.id)}
                        aria-pressed={isSelected}
                        style={isSelected ? { background: "#111827", color: "#ffffff", borderColor: "#111827" } : undefined}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {onboardingError && <div className="error-box">{onboardingError}</div>}

              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleValidateOnboarding()}
                  disabled={savingOnboarding}
                >
                  {savingOnboarding ? "Validation..." : "Valider"}
                </button>
              </div>
            </div>
          </div>
        )}
      </BrowserRouter>
    </div>
  );
}
