import { supabase } from "./supabase";

type CadenceUnit = "day" | "week";

type RegisterEngagementActionParams = {
  userId: string;
  eventKey: string;
  xpGain: number;
};

type RegisterEngagementActionResult =
  | { applied: false }
  | {
      applied: true;
      newXp: number;
      streak_current: number;
      streak_best: number;
      period_progress: number;
      cadence_target: number;
      cadence_unit: CadenceUnit;
    };

type UserEngagementRow = {
  cadence_unit: string | null;
  cadence_target: number | null;
  xp: number | null;
  streak_current: number | null;
  streak_best: number | null;
  last_period_key: string | null;
  period_progress: number | null;
};

function toPositiveInt(value: number | null | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(value));
}

function toInt(value: number | null | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.trunc(value);
}

function getLocalDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toUtcMsForLocalDate(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function getIsoWeekKey(date: Date) {
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfWeek = (localDate.getDay() + 6) % 7;
  localDate.setDate(localDate.getDate() - dayOfWeek + 3);

  const isoYear = localDate.getFullYear();
  const january4 = new Date(isoYear, 0, 4);
  const january4DayOfWeek = (january4.getDay() + 6) % 7;
  const week1Monday = new Date(isoYear, 0, 4 - january4DayOfWeek);

  const daysDiff = Math.round((toUtcMsForLocalDate(localDate) - toUtcMsForLocalDate(week1Monday)) / 86400000);
  const weekNumber = Math.floor(daysDiff / 7) + 1;
  return `${isoYear}-W${String(weekNumber).padStart(2, "0")}`;
}

function getCurrentPeriodKey(cadenceUnit: CadenceUnit) {
  const now = new Date();
  if (cadenceUnit === "day") {
    return getLocalDayKey(now);
  }

  return getIsoWeekKey(now);
}

export async function registerEngagementAction(
  params: RegisterEngagementActionParams
): Promise<RegisterEngagementActionResult> {
  const { userId, eventKey } = params;
  const xpGain = toInt(params.xpGain, 0);

  const insertEvent = await supabase.from("engagement_events").insert({
    user_id: userId,
    event_key: eventKey,
  });

  if (insertEvent.error) {
    if (insertEvent.error.code === "23505") {
      return { applied: false };
    }

    throw insertEvent.error;
  }

  const engagementResult = await supabase
    .from("user_engagement")
    .select("cadence_unit,cadence_target,xp,streak_current,streak_best,last_period_key,period_progress")
    .eq("user_id", userId)
    .maybeSingle();

  if (engagementResult.error) {
    throw engagementResult.error;
  }

  const engagement = engagementResult.data as UserEngagementRow | null;
  if (!engagement) {
    throw new Error("Ligne user_engagement introuvable.");
  }

  const cadence_unit: CadenceUnit = engagement.cadence_unit === "day" ? "day" : "week";
  const cadence_target = Math.max(1, toPositiveInt(engagement.cadence_target, 1));
  let xp = toPositiveInt(engagement.xp, 0);
  let streak_current = toPositiveInt(engagement.streak_current, 0);
  let streak_best = toPositiveInt(engagement.streak_best, 0);
  let last_period_key = engagement.last_period_key;
  let period_progress = toPositiveInt(engagement.period_progress, 0);

  const currentPeriodKey = getCurrentPeriodKey(cadence_unit);

  if (!last_period_key) {
    last_period_key = currentPeriodKey;
    period_progress = 0;
  }

  if (last_period_key !== currentPeriodKey) {
    if (period_progress < cadence_target) {
      streak_current = 0;
    }
    period_progress = 0;
    last_period_key = currentPeriodKey;
  }

  const prevProgress = period_progress;
  period_progress += 1;
  xp += xpGain;

  if (prevProgress < cadence_target && period_progress >= cadence_target) {
    streak_current += 1;
    streak_best = Math.max(streak_best, streak_current);
  }

  const updateResult = await supabase
    .from("user_engagement")
    .update({
      cadence_unit,
      cadence_target,
      xp,
      streak_current,
      streak_best,
      last_period_key,
      period_progress,
    })
    .eq("user_id", userId);

  if (updateResult.error) {
    throw updateResult.error;
  }

  return {
    applied: true,
    newXp: xp,
    streak_current,
    streak_best,
    period_progress,
    cadence_target,
    cadence_unit,
  };
}
