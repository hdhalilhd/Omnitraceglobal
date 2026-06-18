import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./store/auth";
import { api } from "./lib/api";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Machines from "./pages/Machines";
import MachineDetail from "./pages/MachineDetail";
import Alerts from "./pages/Alerts";
import Reports from "./pages/Reports";

export default function App() {
  const { token, user, setUser, logout } = useAuth();
  const [loading, setLoading] = useState(!!token);

  useEffect(() => {
    if (token && !user) {
      api
        .get("/auth/me")
        .then((r) => setUser(r.data))
        .catch(() => logout())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]); // eslint-disable-line

  if (loading) return <div className="p-8 text-gray-500">Yükleniyor…</div>;

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" /> : <Login />} />
      <Route element={token ? <Layout /> : <Navigate to="/login" />}>
        <Route path="/" element={<Home />} />
        <Route path="/machines" element={<Machines />} />
        <Route path="/machines/:id" element={<MachineDetail />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/reports" element={<Reports />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
