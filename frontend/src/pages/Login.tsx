import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuth((s) => s.setAuth);
  const [email, setEmail] = useState("admin@forklift.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/auth/login", { email, password });
      setAuth(r.data.token, r.data.user);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Giriş başarısız");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow p-8 w-96 space-y-4">
        <div className="text-center">
          <div className="text-2xl font-extrabold text-brand-dark">FORKLIFT</div>
          <div className="text-gray-400 text-sm">Telemetri Paneli</div>
        </div>
        {error && <div className="bg-red-50 text-red-600 text-sm rounded p-2">{error}</div>}
        <div>
          <label className="text-sm text-gray-600">E-posta</label>
          <input
            className="w-full border rounded-lg px-3 py-2 mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
          />
        </div>
        <div>
          <label className="text-sm text-gray-600">Parola</label>
          <input
            className="w-full border rounded-lg px-3 py-2 mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
          />
        </div>
        <button
          disabled={busy}
          className="w-full bg-brand hover:bg-brand-dark text-white rounded-lg py-2 font-semibold disabled:opacity-60"
        >
          {busy ? "Giriş yapılıyor…" : "Giriş Yap"}
        </button>
        <p className="text-xs text-gray-400 text-center">Demo: admin@forklift.local / admin123</p>
      </form>
    </div>
  );
}
