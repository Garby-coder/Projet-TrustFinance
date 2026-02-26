import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";

import ProtectedLayout from "./components/ProtectedLayout";
import { supabase } from "./lib/supabase";
import { ensureDefaultsForUser } from "./lib/bootstrap";

import FormationPage from "./pages/FormationPage";
import Login from "./pages/Login";
import SeancesPage from "./pages/SeancesPage";
import StatsPage from "./pages/StatsPage";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const didBootstrap = useRef(false);

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
    (async () => {
      if (!isAuthed) return;
      if (didBootstrap.current) return;
      didBootstrap.current = true;

      const { data, error } = await supabase.auth.getUser();
      if (error) return;

      const userId = data.user?.id;
      if (!userId) return;

      try {
        await ensureDefaultsForUser(userId);
      } catch {
        // optionnel: console.error(e)
      }
    })();
  }, [isAuthed]);

  // 3) UI loading (après les hooks, ok)
  if (loading) {
    return (
      <div className="app-shell">
        <p className="muted">Chargement...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={isAuthed ? <Navigate to="/formation" replace /> : <Login />} />

        <Route path="/" element={isAuthed ? <ProtectedLayout /> : <Navigate to="/login" replace />}>
          <Route index element={<Navigate to="/formation" replace />} />
          <Route path="seances" element={<SeancesPage />} />
          <Route path="formation" element={<FormationPage />} />
          <Route path="stats" element={<StatsPage />} />
        </Route>

        <Route path="*" element={<Navigate to={isAuthed ? "/formation" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}