import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Home, Truck, AlertTriangle, FileText, LogOut } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../store/auth";

const nav = [
  { to: "/", label: "Anasayfa", icon: Home, end: true },
  { to: "/machines", label: "Makineler", icon: Truck, end: false },
  { to: "/alerts", label: "Uyarılar", icon: AlertTriangle, end: false },
  { to: "/reports", label: "Raporlar", icon: FileText, end: false },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-24 bg-white border-r flex flex-col items-center py-4 gap-2">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              clsx(
                "w-20 py-3 rounded-lg flex flex-col items-center gap-1 text-xs",
                isActive ? "bg-brand/15 text-brand-dark font-semibold" : "text-gray-500 hover:bg-gray-100",
              )
            }
          >
            <n.icon size={22} />
            {n.label}
          </NavLink>
        ))}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-brand flex items-center justify-between px-5 text-white">
          <div className="font-extrabold tracking-tight text-lg">
            FORKLIFT <span className="font-light">Telemetri</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="opacity-90">{user?.name}</span>
            <button
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="flex items-center gap-1 hover:opacity-80"
            >
              <LogOut size={18} /> Çıkış
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
