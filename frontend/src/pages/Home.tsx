import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Truck, Activity, PowerOff, AlertTriangle } from "lucide-react";
import { api } from "../lib/api";
import { Vehicle } from "../types";

export default function Home() {
  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["vehicles"],
    queryFn: async () => (await api.get("/vehicles")).data,
  });

  const total = vehicles.length;
  const active = vehicles.filter((v) => v.status === "ACTIVE").length;
  const offline = vehicles.filter((v) => v.status === "OFFLINE").length;
  const errors = vehicles.reduce((s, v) => s + (v.activeErrorCount ?? 0), 0);

  const cards = [
    { label: "Toplam Makine", value: total, icon: Truck, color: "text-gray-700" },
    { label: "Aktif", value: active, icon: Activity, color: "text-green-600" },
    { label: "Çevrimdışı", value: offline, icon: PowerOff, color: "text-gray-400" },
    { label: "Aktif Uyarı", value: errors, icon: AlertTriangle, color: "text-red-500" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-700">Anasayfa</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4">
            <c.icon className={c.color} size={32} />
            <div>
              <div className="text-3xl font-bold">{c.value}</div>
              <div className="text-gray-500 text-sm">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="font-semibold text-gray-600 mb-3">Makineler</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {vehicles.map((v) => (
            <Link
              key={v.id}
              to={`/machines/${v.id}`}
              className="bg-white rounded-xl shadow-sm p-4 hover:shadow transition"
            >
              <div className="h-20 flex items-center justify-center text-gray-300">
                <Truck size={48} />
              </div>
              <div className="font-semibold text-sm truncate">{v.chassisNo}</div>
              <div className="text-xs text-gray-400">{v.name ?? v.model ?? v.type}</div>
              <StatusDot status={v.status} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StatusDot({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    ACTIVE: ["bg-green-500", "Aktif"],
    IDLE: ["bg-yellow-500", "Rölanti"],
    OFFLINE: ["bg-gray-400", "Kapalı"],
    MAINTENANCE: ["bg-red-500", "Bakım"],
  };
  const [dot, label] = map[status] ?? ["bg-gray-400", status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 mt-1">
      <span className={`w-2 h-2 rounded-full ${dot}`} /> {label}
    </span>
  );
}
