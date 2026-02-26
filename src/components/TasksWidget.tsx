import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type TaskItem = {
  id: string;
  title: string;
  priority: string | null;
  due_date: string | null;
  est_minutes: number | null;
  status: string | null;
};

function formatDueDate(dueDate: string | null) {
  if (!dueDate) {
    return "Sans échéance";
  }

  const timestamp = Date.parse(dueDate);
  if (Number.isNaN(timestamp)) {
    return "Sans échéance";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

function getPriorityLabel(priority: string | null) {
  const normalized = priority?.toLowerCase();

  if (normalized === "high") {
    return { text: "Priorité haute", className: "priority-high" };
  }
  if (normalized === "medium") {
    return { text: "Priorité moyenne", className: "priority-medium" };
  }
  if (normalized === "low") {
    return { text: "Priorité basse", className: "priority-low" };
  }

  return { text: "Priorité non définie", className: "priority-neutral" };
}

export default function TasksWidget() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,priority,due_date,est_minutes,status")
        .neq("status", "done")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(5);

      if (!isMounted) {
        return;
      }

      if (error) {
        setError(error.message);
      } else {
        setTasks(data ?? []);
      }

      setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="section-block tasks-widget">
      <h3 className="subsection-title">Tâches à venir</h3>

      {error && <div className="error-box">Erreur Supabase: {error}</div>}
      {loading && <p className="muted">Chargement...</p>}

      {!loading && tasks.length === 0 && <div className="empty-state">Aucune tâche à venir.</div>}

      {!loading && tasks.length > 0 && (
        <div className="tasks-list">
          {tasks.map((task) => {
            const priority = getPriorityLabel(task.priority);

            return (
              <article key={task.id} className="task-row">
                <div>
                  <h4 className="task-title">{task.title}</h4>
                  <p className="task-meta">
                    Échéance: {formatDueDate(task.due_date)}
                    {task.est_minutes ? ` · ${task.est_minutes} min` : ""}
                  </p>
                </div>
                <span className={`priority-badge ${priority.className}`}>{priority.text}</span>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
