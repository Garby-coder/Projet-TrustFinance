import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Stats = {
  totalLessons: number;
  totalSessions: number;
  tasksTodoDoing: number;
  tasksDone: number;
};

async function fetchTableCount(table: "lessons" | "sessions") {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) {
    throw error;
  }
  return count ?? 0;
}

async function fetchTaskSplit() {
  const statusResult = await supabase.from("tasks").select("status");
  if (!statusResult.error) {
    const rows = (statusResult.data ?? []) as Array<{ status: string | null }>;
    const done = rows.filter((row) => row.status?.toLowerCase() === "done").length;
    return { todoDoing: rows.length - done, done };
  }

  const booleanColumns = ["is_done", "done", "completed"] as const;

  for (const column of booleanColumns) {
    const boolResult = await supabase.from("tasks").select(column);
    if (!boolResult.error) {
      const rows = (boolResult.data ?? []) as Array<Record<string, boolean | null>>;
      const done = rows.filter((row) => row[column] === true).length;
      return { todoDoing: rows.length - done, done };
    }
  }

  throw statusResult.error;
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats>({
    totalLessons: 0,
    totalSessions: 0,
    tasksTodoDoing: 0,
    tasksDone: 0,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const [totalLessons, totalSessions, taskSplit] = await Promise.all([
          fetchTableCount("lessons"),
          fetchTableCount("sessions"),
          fetchTaskSplit(),
        ]);

        if (!isMounted) {
          return;
        }

        setStats({
          totalLessons,
          totalSessions,
          tasksTodoDoing: taskSplit.todoDoing,
          tasksDone: taskSplit.done,
        });
      } catch (err) {
        if (!isMounted) {
          return;
        }

        setError(err instanceof Error ? err.message : "Erreur lors du chargement des statistiques.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section>
      <h2 className="section-title">Statistiques</h2>
      <p className="section-subtitle">Vue rapide de votre contenu et de vos tâches.</p>

      {error && <div className="error-box">Erreur Supabase: {error}</div>}
      {loading && <p className="muted">Chargement...</p>}

      {!loading && (
        <div className="stats-grid">
          <article className="stat-card">
            <p className="stat-label">Total lessons</p>
            <p className="stat-value">{stats.totalLessons}</p>
          </article>

          <article className="stat-card">
            <p className="stat-label">Total sessions</p>
            <p className="stat-value">{stats.totalSessions}</p>
          </article>

          <article className="stat-card">
            <p className="stat-label">Tasks</p>
            <p className="stat-value">{stats.tasksTodoDoing}</p>
            <p className="stat-subvalue">todo/doing</p>
            <p className="stat-subvalue">done: {stats.tasksDone}</p>
          </article>
        </div>
      )}
    </section>
  );
}
