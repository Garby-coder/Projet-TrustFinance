import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import Lessons from "./pages/LessonsPage";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthed(!!data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(!!session);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) return <div style={{ padding: 30, fontFamily: "system-ui" }}>Chargement…</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={isAuthed ? <Navigate to="/lessons" /> : <Login />} />
        <Route path="/lessons" element={isAuthed ? <Lessons /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={isAuthed ? "/lessons" : "/login"} />} />
      </Routes>
    </BrowserRouter>
  );
}