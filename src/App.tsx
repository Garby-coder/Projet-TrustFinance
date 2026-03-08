import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import "./styles/make-dashboard.css";

import ProtectedLayout from "./components/ProtectedLayout";
import { supabase } from "./lib/supabase";
import { ensureDefaultsForUser } from "./lib/bootstrap";
import { registerEngagementAction } from "./lib/engagement";

import Login from "./pages/Login";
import StatsPage from "./pages/StatsPage";
import AdminPage from "./pages/AdminPage";

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

type UserProfileIdentity = {
  first_name: string | null;
  last_name: string | null;
};

type UserOnboarding = {
  age_range: string | null;
  profession: string | null;
  use_reason: string | null;
  primary_goal: string | null;
  secondary_goals: string | null;
  experience_level: string | null;
  discovery_source: string | null;
  completed_at: string | null;
};

type OnboardingFormState = {
  firstName: string;
  lastName: string;
  ageRange: string;
  profession: string;
  useReason: string;
  primaryGoal: string;
  secondaryGoals: string;
  experienceLevel: string;
  discoverySource: string;
};

const CADENCE_OPTIONS: CadenceOption[] = [
  { id: "daily", label: "Tous les jours", cadence_unit: "day", cadence_target: 1 },
  { id: "three-per-week", label: "3 fois par semaine", cadence_unit: "week", cadence_target: 3 },
  { id: "once-per-week", label: "1 fois par semaine", cadence_unit: "week", cadence_target: 1 },
];
const AGE_RANGE_OPTIONS = ["Moins de 25 ans", "25 à 34 ans", "35 à 44 ans", "45 à 54 ans", "55 ans et plus"] as const;
const EXPERIENCE_LEVEL_OPTIONS = ["Débutant", "Intermédiaire", "Avancé"] as const;
const DISCOVERY_SOURCE_OPTIONS = ["WhatsApp", "Instagram", "YouTube", "Recommandation", "Recherche web", "Autre"] as const;
const EMPTY_ONBOARDING_FORM: OnboardingFormState = {
  firstName: "",
  lastName: "",
  ageRange: "",
  profession: "",
  useReason: "",
  primaryGoal: "",
  secondaryGoals: "",
  experienceLevel: "",
  discoverySource: "",
};
const LAST_PATH_STORAGE_KEY = "tf:lastPath";
const RESTORABLE_LAST_PATHS = new Set(["/stats", "/formation", "/seances", "/admin"]);

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

function isMissingUserOnboardingTable(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as { code?: string; message?: string };
  const message = err.message?.toLowerCase() ?? "";
  return err.code === "42P01" || message.includes("relation") && message.includes("user_onboarding") && message.includes("does not exist");
}

function isMissingProfileIdentityColumns(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as { code?: string; message?: string };
  const message = err.message?.toLowerCase() ?? "";
  return err.code === "42703" && (message.includes("first_name") || message.includes("last_name"));
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function RoutePersistence({ isAuthed }: { isAuthed: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const didRestorePath = useRef(false);

  useEffect(() => {
    if (location.pathname === "/login") {
      return;
    }

    const fullPath = `${location.pathname}${location.search || ""}`;
    try {
      window.localStorage.setItem(LAST_PATH_STORAGE_KEY, fullPath);
    } catch {
      // Ignore localStorage errors.
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isAuthed) {
      didRestorePath.current = false;
      return;
    }

    if (didRestorePath.current) {
      return;
    }

    if (location.pathname !== "/login" && location.pathname !== "/") {
      didRestorePath.current = true;
      return;
    }

    let lastPath = "";
    try {
      lastPath = (window.localStorage.getItem(LAST_PATH_STORAGE_KEY) ?? "").trim();
    } catch {
      lastPath = "";
    }

    if (!lastPath) {
      didRestorePath.current = true;
      return;
    }

    const lastPathname = lastPath.split("?")[0] ?? "";
    if (!RESTORABLE_LAST_PATHS.has(lastPathname)) {
      didRestorePath.current = true;
      return;
    }

    const currentFullPath = `${location.pathname}${location.search || ""}`;
    if (lastPath !== currentFullPath) {
      didRestorePath.current = true;
      navigate(lastPath, { replace: true });
      return;
    }

    didRestorePath.current = true;
  }, [isAuthed, location.pathname, location.search, navigate]);

  return null;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [selectedCadenceId, setSelectedCadenceId] = useState<CadenceOption["id"]>("once-per-week");
  const [onboardingForm, setOnboardingForm] = useState<OnboardingFormState>(EMPTY_ONBOARDING_FORM);
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

  async function fetchUserProfileIdentity(currentUserId: string) {
    const result = await supabase
      .from("profiles")
      .select("first_name,last_name")
      .eq("id", currentUserId)
      .maybeSingle();

    if (result.error) {
      if (isMissingProfileIdentityColumns(result.error)) {
        return null;
      }
      throw result.error;
    }

    return result.data as UserProfileIdentity | null;
  }

  async function fetchUserOnboardingRow(currentUserId: string) {
    const result = await supabase
      .from("user_onboarding")
      .select("age_range,profession,use_reason,primary_goal,secondary_goals,experience_level,discovery_source,completed_at")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (result.error) {
      if (isMissingUserOnboardingTable(result.error)) {
        return null;
      }
      throw result.error;
    }

    return result.data as UserOnboarding | null;
  }

  async function trackDailyLogin(currentUserId: string) {
    try {
      const dateKey = getLocalDateKey();
      const localStorageKey = `tf_login_logged:${currentUserId}:${dateKey}`;

      if (window.localStorage.getItem(localStorageKey)) {
        return;
      }

      const result = await registerEngagementAction({
        userId: currentUserId,
        eventKey: `login:${dateKey}`,
        xpGain: 0,
      });

      if (result.applied) {
        window.dispatchEvent(new CustomEvent("tf:engagement", { detail: result }));
      }

      window.localStorage.setItem(localStorageKey, "1");
    } catch {
      // Ne pas bloquer l'app si le tracking échoue.
    }
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
          setOnboardingForm(EMPTY_ONBOARDING_FORM);
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
        await trackDailyLogin(userId);
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

        const [profileIdentity, userOnboarding] = await Promise.all([
          fetchUserProfileIdentity(userId),
          fetchUserOnboardingRow(userId),
        ]);

        if (!isMounted) {
          return;
        }

        if (!engagement) {
          setShowOnboardingModal(false);
          setOnboardingError("Impossible de charger ton rythme pour le moment.");
          return;
        }

        setSelectedCadenceId(getCadenceSelection(engagement));
        setOnboardingForm({
          firstName: normalizeText(profileIdentity?.first_name),
          lastName: normalizeText(profileIdentity?.last_name),
          ageRange: normalizeText(userOnboarding?.age_range),
          profession: normalizeText(userOnboarding?.profession),
          useReason: normalizeText(userOnboarding?.use_reason),
          primaryGoal: normalizeText(userOnboarding?.primary_goal),
          secondaryGoals: normalizeText(userOnboarding?.secondary_goals),
          experienceLevel: normalizeText(userOnboarding?.experience_level),
          discoverySource: normalizeText(userOnboarding?.discovery_source),
        });
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

    const firstName = onboardingForm.firstName.trim();
    const lastName = onboardingForm.lastName.trim();

    if (!firstName) {
      setOnboardingError("Le prénom est obligatoire.");
      return;
    }

    if (!lastName) {
      setOnboardingError("Le nom est obligatoire.");
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
      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
        })
        .eq("id", userId);

      if (profileUpdateError) {
        throw profileUpdateError;
      }

      const nowIso = new Date().toISOString();
      const { error: onboardingUpsertError } = await supabase
        .from("user_onboarding")
        .upsert(
          {
            user_id: userId,
            age_range: onboardingForm.ageRange.trim() || null,
            profession: onboardingForm.profession.trim() || null,
            use_reason: onboardingForm.useReason.trim() || null,
            primary_goal: onboardingForm.primaryGoal.trim() || null,
            secondary_goals: onboardingForm.secondaryGoals.trim() || null,
            experience_level: onboardingForm.experienceLevel.trim() || null,
            discovery_source: onboardingForm.discoverySource.trim() || null,
            completed_at: nowIso,
          },
          { onConflict: "user_id" }
        );

      if (onboardingUpsertError) {
        throw onboardingUpsertError;
      }

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

      window.dispatchEvent(
        new CustomEvent("tf:profile-updated", {
          detail: { first_name: firstName, last_name: lastName },
        })
      );
      setShowOnboardingModal(false);
    } catch (error) {
      if (isMissingUserEngagementTable(error)) {
        setOnboardingDisabled(true);
        setShowOnboardingModal(false);
        setOnboardingError("");
        return;
      }

      if (isMissingUserOnboardingTable(error)) {
        setOnboardingError("Le formulaire onboarding n'est pas disponible pour le moment.");
      } else if (isMissingProfileIdentityColumns(error)) {
        setOnboardingError("Impossible d'enregistrer ton prénom et ton nom pour le moment.");
      } else {
        setOnboardingError("Impossible d'enregistrer ton onboarding. Réessaie.");
      }
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
        <RoutePersistence isAuthed={isAuthed} />

        <Routes>
          <Route path="/login" element={isAuthed ? <Navigate to="/" replace /> : <Login />} />

          <Route path="/" element={isAuthed ? <ProtectedLayout /> : <Navigate to="/login" replace />}>
            <Route index element={<StatsPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="seances" element={<Navigate to="/" replace />} />
            <Route path="formation" element={<Navigate to="/" replace />} />
          </Route>

          <Route path="*" element={<Navigate to={isAuthed ? "/" : "/login"} replace />} />
        </Routes>

        {isAuthed && onboardingLoading && !showOnboardingModal && <p className="muted">Chargement de ton onboarding...</p>}
        {isAuthed && onboardingError && !showOnboardingModal && <div className="error-box">{onboardingError}</div>}

        {isAuthed && showOnboardingModal && (
          <div className="modal-backdrop tf-modalBackdrop">
            <div className="modal-panel tf-modalPanel" role="dialog" aria-modal="true" aria-labelledby="global-cadence-onboarding-title">
              <div className="modal-header">
                <div>
                  <h3 id="global-cadence-onboarding-title" className="modal-title">
                    Configurons ton profil (1 min)
                  </h3>
                  <p className="card-text">Réponds à ces questions pour personnaliser ton expérience.</p>
                </div>
              </div>

              <div className="modal-section">
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  <div className="tf-adminModalField">
                    <label className="tf-subtitle" htmlFor="onboarding-first-name">Prénom</label>
                    <input
                      id="onboarding-first-name"
                      type="text"
                      className="tf-adminInput"
                      value={onboardingForm.firstName}
                      onChange={(event) => setOnboardingForm((current) => ({ ...current, firstName: event.target.value }))}
                      placeholder="Ex: Camille"
                    />
                  </div>
                  <div className="tf-adminModalField">
                    <label className="tf-subtitle" htmlFor="onboarding-last-name">Nom</label>
                    <input
                      id="onboarding-last-name"
                      type="text"
                      className="tf-adminInput"
                      value={onboardingForm.lastName}
                      onChange={(event) => setOnboardingForm((current) => ({ ...current, lastName: event.target.value }))}
                      placeholder="Ex: Dupont"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  <div className="tf-adminModalField">
                    <label className="tf-subtitle" htmlFor="onboarding-age-range">Tranche d’âge</label>
                    <select
                      id="onboarding-age-range"
                      className="tf-adminInput"
                      value={onboardingForm.ageRange}
                      onChange={(event) => setOnboardingForm((current) => ({ ...current, ageRange: event.target.value }))}
                    >
                      <option value="">Sélectionner</option>
                      {AGE_RANGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="tf-adminModalField">
                    <label className="tf-subtitle" htmlFor="onboarding-profession">Profession</label>
                    <input
                      id="onboarding-profession"
                      type="text"
                      className="tf-adminInput"
                      value={onboardingForm.profession}
                      onChange={(event) => setOnboardingForm((current) => ({ ...current, profession: event.target.value }))}
                      placeholder="Ex: Consultant, Salarié, Entrepreneur..."
                    />
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  <div className="tf-adminModalField">
                    <label className="tf-subtitle" htmlFor="onboarding-use-reason">Pourquoi utilises-tu l’outil ?</label>
                    <input
                      id="onboarding-use-reason"
                      type="text"
                      className="tf-adminInput"
                      value={onboardingForm.useReason}
                      onChange={(event) => setOnboardingForm((current) => ({ ...current, useReason: event.target.value }))}
                      placeholder="Ex: Mieux gérer mes finances et investir régulièrement"
                    />
                  </div>
                  <div className="tf-adminModalField">
                    <label className="tf-subtitle" htmlFor="onboarding-primary-goal">Quel est ton objectif principal ?</label>
                    <input
                      id="onboarding-primary-goal"
                      type="text"
                      className="tf-adminInput"
                      value={onboardingForm.primaryGoal}
                      onChange={(event) => setOnboardingForm((current) => ({ ...current, primaryGoal: event.target.value }))}
                      placeholder="Ex: Construire une stratégie patrimoniale claire"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  <div className="tf-adminModalField">
                    <label className="tf-subtitle" htmlFor="onboarding-experience-level">Quel est ton niveau actuel ?</label>
                    <select
                      id="onboarding-experience-level"
                      className="tf-adminInput"
                      value={onboardingForm.experienceLevel}
                      onChange={(event) => setOnboardingForm((current) => ({ ...current, experienceLevel: event.target.value }))}
                    >
                      <option value="">Sélectionner</option>
                      {EXPERIENCE_LEVEL_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="tf-adminModalField">
                    <label className="tf-subtitle" htmlFor="onboarding-discovery-source">Comment nous as-tu connus ?</label>
                    <select
                      id="onboarding-discovery-source"
                      className="tf-adminInput"
                      value={onboardingForm.discoverySource}
                      onChange={(event) => setOnboardingForm((current) => ({ ...current, discoverySource: event.target.value }))}
                    >
                      <option value="">Sélectionner</option>
                      {DISCOVERY_SOURCE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <div className="tf-adminModalField">
                  <label className="tf-subtitle" htmlFor="onboarding-secondary-goals">Quels sont tes objectifs secondaires ?</label>
                  <textarea
                    id="onboarding-secondary-goals"
                    className="tf-adminTextarea"
                    value={onboardingForm.secondaryGoals}
                    onChange={(event) => setOnboardingForm((current) => ({ ...current, secondaryGoals: event.target.value }))}
                    placeholder="Ex: mieux comprendre la bourse, optimiser mon budget, préparer un achat immobilier..."
                  />
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
                        style={
                          isSelected
                            ? {
                                background: "rgba(175, 135, 50, 0.24)",
                                color: "#ffffff",
                                borderColor: "rgba(175, 135, 50, 0.85)",
                                boxShadow: "0 0 0 1px rgba(175, 135, 50, 0.35)",
                                fontWeight: 700,
                              }
                            : {
                                background: "rgba(255, 255, 255, 0.03)",
                                color: "rgba(245, 245, 245, 0.9)",
                                borderColor: "rgba(255, 255, 255, 0.18)",
                              }
                        }
                      >
                        {isSelected ? `✓ ${option.label}` : option.label}
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
