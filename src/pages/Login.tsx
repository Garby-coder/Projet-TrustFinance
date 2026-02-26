import { useState } from "react";
import { supabase } from "../lib/supabase";

function toLoginErrorMessage(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();
  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("user already registered") ||
    normalized.includes("signup") ||
    normalized.includes("sign up")
  ) {
    return "Identifiants invalides.";
  }

  return "Impossible de se connecter pour le moment.";
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string>("");

  async function signIn() {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(toLoginErrorMessage(error.message));
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h2>Connexion</h2>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          className="input-field"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="email@exemple.com"
          autoComplete="email"
        />

        <label htmlFor="password">Mot de passe</label>
        <input
          id="password"
          className="input-field"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="********"
          autoComplete="current-password"
        />

        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={() => void signIn()}>
            Se connecter
          </button>
        </div>

        <p className="card-meta" style={{ marginTop: 12 }}>
          Accès réservé aux clients TrustFinance. Si tu n’as pas encore reçu tes identifiants, contacte ton coach.
        </p>

        {msg && <p className="message">{msg}</p>}
      </div>
    </div>
  );
}
