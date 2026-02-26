import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type TaskItem = {
  id: string;
  title: string;
  priority: string | null;
  due_date: string | null;
  est_minutes: number | null;
  status: string | null;
  updated_at?: string | null;
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

function parseDate(dateValue: string | null | undefined) {
  if (!dateValue) {
    return null;
  }

  const timestamp = Date.parse(dateValue);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return timestamp;
}

function isDoneTask(task: TaskItem) {
  return task.status?.toLowerCase() === "done";
}

function getPriorityRank(priority: string | null) {
  const normalized = priority?.toLowerCase();

  if (normalized === "high") {
    return 0;
  }
  if (normalized === "medium") {
    return 1;
  }
  if (normalized === "low") {
    return 2;
  }

  return 3;
}

function compareDueDateAscNullsLast(aDate: string | null, bDate: string | null) {
  const a = parseDate(aDate);
  const b = parseDate(bDate);

  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }

  return a - b;
}

function compareDueDateDescNullsLast(aDate: string | null, bDate: string | null) {
  const a = parseDate(aDate);
  const b = parseDate(bDate);

  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }

  return b - a;
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

async function fetchTasks() {
  const withUpdatedAt = await supabase.from("tasks").select("id,title,priority,due_date,est_minutes,status,updated_at");

  if (!withUpdatedAt.error) {
    return (withUpdatedAt.data ?? []) as TaskItem[];
  }

  if (withUpdatedAt.error.message.toLowerCase().includes("updated_at")) {
    const fallback = await supabase.from("tasks").select("id,title,priority,due_date,est_minutes,status");
    if (fallback.error) {
      throw fallback.error;
    }

    return ((fallback.data ?? []) as TaskItem[]).map((task) => ({ ...task, updated_at: null }));
  }

  throw withUpdatedAt.error;
}

export default function TasksWidget() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [updateError, setUpdateError] = useState<string>("");
  const [updatingTaskIds, setUpdatingTaskIds] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const data = await fetchTasks();
        if (isMounted) {
          setTasks(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Impossible de charger les tâches.");
        }
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

  const upcomingTasks = tasks
    .filter((task) => !isDoneTask(task))
    .sort((a, b) => {
      const priorityDiff = getPriorityRank(a.priority) - getPriorityRank(b.priority);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const dueDateDiff = compareDueDateAscNullsLast(a.due_date, b.due_date);
      if (dueDateDiff !== 0) {
        return dueDateDiff;
      }

      return a.title.localeCompare(b.title, "fr");
    });

  const completedTasks = tasks
    .filter((task) => isDoneTask(task))
    .sort((a, b) => {
      const updatedA = parseDate(a.updated_at);
      const updatedB = parseDate(b.updated_at);

      if (updatedA !== null || updatedB !== null) {
        if (updatedA === null && updatedB !== null) {
          return 1;
        }
        if (updatedA !== null && updatedB === null) {
          return -1;
        }
        if (updatedA !== null && updatedB !== null && updatedA !== updatedB) {
          return updatedB - updatedA;
        }
      }

      const dueDateDiff = compareDueDateDescNullsLast(a.due_date, b.due_date);
      if (dueDateDiff !== 0) {
        return dueDateDiff;
      }

      return a.title.localeCompare(b.title, "fr");
    });

  async function updateTaskStatus(task: TaskItem, checked: boolean) {
    const previousStatus = task.status ?? "todo";
    const nextStatus = checked ? "done" : "todo";

    if (previousStatus.toLowerCase() === nextStatus) {
      return;
    }

    setUpdateError("");
    setUpdatingTaskIds((current) => [...current, task.id]);
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, status: nextStatus } : item)));

    const { error } = await supabase.from("tasks").update({ status: nextStatus }).eq("id", task.id);

    if (error) {
      setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, status: previousStatus } : item)));
      setUpdateError("Impossible de mettre à jour la tâche pour le moment.");
    }

    setUpdatingTaskIds((current) => current.filter((id) => id !== task.id));
  }

  function renderTask(task: TaskItem, isDoneSection: boolean) {
    const priority = getPriorityLabel(task.priority);
    const isUpdating = updatingTaskIds.includes(task.id);
    const checked = isDoneTask(task);

    return (
      <article key={task.id} className={`task-row${checked ? " task-row-done" : ""}`}>
        <label className="task-checkbox">
          <input
            type="checkbox"
            checked={checked}
            disabled={isUpdating}
            onChange={(event) => {
              void updateTaskStatus(task, event.target.checked);
            }}
            aria-label={`Marquer la tâche ${task.title} comme ${checked ? "à faire" : "terminée"}`}
          />
        </label>

        <div className="task-main">
          <h4 className={`task-title${checked ? " task-title-done" : ""}`}>{task.title}</h4>
          <p className="task-meta">
            Échéance: {formatDueDate(task.due_date)}
            {task.est_minutes ? ` · ${task.est_minutes} min` : ""}
          </p>
        </div>

        {!isDoneSection && <span className={`priority-badge ${priority.className}`}>{priority.text}</span>}
      </article>
    );
  }

  return (
    <div className="section-block tasks-widget">
      <h3 className="subsection-title">Tâches</h3>

      {error && <div className="error-box">Erreur Supabase: {error}</div>}
      {!error && updateError && <p className="task-update-error">{updateError}</p>}
      {loading && <p className="muted">Chargement...</p>}

      {!loading && (
        <>
          <div className="tasks-section">
            <h4 className="tasks-section-title">Tâches à venir</h4>
            {upcomingTasks.length === 0 && <div className="empty-state">Aucune tâche à venir.</div>}

            {upcomingTasks.length > 0 && <div className="tasks-list">{upcomingTasks.map((task) => renderTask(task, false))}</div>}
          </div>

          <div className="tasks-section">
            <h4 className="tasks-section-title">Tâches accomplies</h4>
            {completedTasks.length === 0 && <div className="empty-state">Aucune tâche accomplie.</div>}

            {completedTasks.length > 0 && <div className="tasks-list">{completedTasks.map((task) => renderTask(task, true))}</div>}
          </div>
        </>
      )}
    </div>
  );
}
