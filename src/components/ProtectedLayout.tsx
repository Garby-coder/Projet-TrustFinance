import { NavLink, Outlet } from "react-router-dom";
import { supabase } from "../lib/supabase";

const tabs = [
  { to: "/seances", label: "Mes séances" },
  { to: "/formation", label: "Ma formation" },
  { to: "/stats", label: "Statistiques" },
];

export default function ProtectedLayout() {
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">Formation Finance Pro</h1>
          <p className="app-subtitle">Suivi de vos séances, de vos leçons et de votre progression.</p>
        </div>
        <button type="button" className="btn" onClick={() => void handleSignOut()}>
          Se déconnecter
        </button>
      </header>

      <nav className="tabs" aria-label="Navigation principale">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `tab-link${isActive ? " is-active" : ""}`}>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <main className="page-content">
        <Outlet />
      </main>
    </div>
  );
}
