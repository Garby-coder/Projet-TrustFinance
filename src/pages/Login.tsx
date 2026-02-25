import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string>("");

  async function signUp() {
    setMsg("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setMsg(error.message);
    else setMsg("Compte créé. Vérifie tes emails si confirmation activée.");
  }

  async function signIn() {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg(error.message);
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
          <button type="button" className="btn" onClick={() => void signUp()}>
            Créer un compte
          </button>
        </div>

        {msg && <p className="message">{msg}</p>}
      </div>
    </div>
  );
}
