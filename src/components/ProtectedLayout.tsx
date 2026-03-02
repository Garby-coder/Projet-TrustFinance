import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

type EngagementState = {
  xp: number;
  streak_current: number;
  streak_best: number;
  period_progress: number;
  cadence_target: number;
  cadence_unit: "day" | "week";
};

function toInt(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.trunc(value);
}

function normalizeEngagementRecord(record: Record<string, unknown>, current: EngagementState | null) {
  const nextXp = toInt(record.xp ?? record.newXp, current?.xp ?? 0);
  const nextStreakCurrent = toInt(record.streak_current, current?.streak_current ?? 0);
  const nextStreakBest = toInt(record.streak_best, current?.streak_best ?? 0);
  const nextPeriodProgress = toInt(record.period_progress, current?.period_progress ?? 0);
  const nextCadenceTarget = Math.max(1, toInt(record.cadence_target, current?.cadence_target ?? 1));
  const nextCadenceUnit = record.cadence_unit === "day" ? "day" : "week";

  return {
    xp: nextXp,
    streak_current: nextStreakCurrent,
    streak_best: nextStreakBest,
    period_progress: nextPeriodProgress,
    cadence_target: nextCadenceTarget,
    cadence_unit: nextCadenceUnit,
  } satisfies EngagementState;
}

function isMissingUserEngagementTable(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";
  return error.code === "42P01" || (message.includes("does not exist") && message.includes("user_engagement"));
}

export default function ProtectedLayout() {
  const [engagement, setEngagement] = useState<EngagementState | null>(null);
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;

    const handleEngagementUpdate: EventListener = (event) => {
      const customEvent = event as CustomEvent<unknown>;
      if (!customEvent.detail || typeof customEvent.detail !== "object") {
        return;
      }

      const detail = customEvent.detail as Record<string, unknown>;
      setEngagement((current) => normalizeEngagementRecord(detail, current));
    };

    window.addEventListener("tf:engagement", handleEngagementUpdate);

    (async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.id || !isMounted) {
        return;
      }

      const { data, error } = await supabase
        .from("user_engagement")
        .select("xp,streak_current,streak_best,period_progress,cadence_target,cadence_unit")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (error) {
        if (!isMissingUserEngagementTable(error)) {
          console.warn("Impossible de charger l'engagement utilisateur.", error);
        }
        return;
      }

      if (!data) {
        return;
      }

      setEngagement(
        normalizeEngagementRecord(
          data as unknown as Record<string, unknown>,
          null
        )
      );
    })();

    return () => {
      isMounted = false;
      window.removeEventListener("tf:engagement", handleEngagementUpdate);
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const level = engagement ? Math.floor(Math.max(0, engagement.xp) / 200) + 1 : null;
  const cadenceLabel = engagement?.cadence_unit === "day" ? "jour" : "semaine";
  const isDashboardRoute = location.pathname === "/";

  if (isDashboardRoute) {
    return <Outlet />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">Formation Finance Pro</h1>
          <p className="app-subtitle">Dashboard élève - progression, formation et coaching.</p>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {engagement && level !== null && (
            <div className="card" style={{ padding: "10px 12px", borderRadius: 12, minWidth: 230 }}>
              <p className="card-meta" style={{ margin: 0 }}>
                Niveau {level} · {engagement.xp} XP
              </p>
              <p className="card-meta" style={{ margin: "4px 0 0" }}>
                Série: {engagement.streak_current} / record {engagement.streak_best}
              </p>
              <p className="card-meta" style={{ margin: "4px 0 0" }}>
                Objectif: {engagement.period_progress} / {engagement.cadence_target} {cadenceLabel}
              </p>
            </div>
          )}

          <button type="button" className="btn" onClick={() => void handleSignOut()}>
            Se déconnecter
          </button>
        </div>
      </header>

      <main className="page-content">
        <Outlet />
      </main>
    </div>
  );
}
