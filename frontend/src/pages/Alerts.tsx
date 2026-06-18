import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { ErrorLog, Vehicle, Severity, Source } from "../types";
import SourceBadge from "../components/SourceBadge";
import clsx from "clsx";

const sevStyle: Record<Severity, string> = {
  INFO: "bg-blue-100 text-blue-700",
  WARNING: "bg-amber-100 text-amber-700",
  CRITICAL: "bg-red-100 text-red-700",
};

export default function Alerts() {
  const qc = useQueryClient();
  const [vehicleId, setVehicleId] = useState<string>("");
  const [active, setActive] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [severity, setSeverity] = useState<string>("");
  const [q, setQ] = useState("");

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["vehicles"],
    queryFn: async () => (await api.get("/vehicles")).data,
  });

  const params = {
    ...(vehicleId && { vehicleId }),
    ...(active && { active }),
    ...(source && { source }),
    ...(severity && { severity }),
    ...(q && { q }),
  };

  const { data } = useQuery<{ items: ErrorLog[]; total: number }>({
    queryKey: ["errors", params],
    queryFn: async () => (await api.get("/errors", { params })).data,
  });

  // Canlı: yeni hata gelince listeyi tazele
  useEffect(() => {
    const socket = getSocket();
    const onAlert = () => qc.invalidateQueries({ queryKey: ["errors"] });
    socket.on("alerts", onAlert);
    return () => {
      socket.off("alerts", onAlert);
    };
  }, [qc]);

  const clearMut = useMutation({
    mutationFn: async (errId: number) => (await api.post(`/errors/${errId}/clear`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["errors"] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-700">Uyarılar / Hata Logu</h1>

      <div className="bg-white rounded-xl shadow-sm p-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
        <select className="border rounded-lg px-2 py-2" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">Tüm araçlar</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.chassisNo}
            </option>
          ))}
        </select>
        <select className="border rounded-lg px-2 py-2" value={active} onChange={(e) => setActive(e.target.value)}>
          <option value="">Tümü (aktif/temiz)</option>
          <option value="true">Sadece aktif</option>
          <option value="false">Sadece temizlenmiş</option>
        </select>
        <select className="border rounded-lg px-2 py-2" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Tüm kaynaklar</option>
          <option value="TRACTION">Yürüyüş</option>
          <option value="PUMP">Pompa</option>
        </select>
        <select className="border rounded-lg px-2 py-2" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">Tüm şiddetler</option>
          <option value="INFO">Bilgi</option>
          <option value="WARNING">Uyarı</option>
          <option value="CRITICAL">Kritik</option>
        </select>
        <input
          className="border rounded-lg px-2 py-2"
          placeholder="Ara (kod/açıklama)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="p-3">Zaman</th>
              <th className="p-3">Araç</th>
              <th className="p-3">Kaynak</th>
              <th className="p-3">Kod</th>
              <th className="p-3">Açıklama</th>
              <th className="p-3">Şiddet</th>
              <th className="p-3">Durum</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((e) => (
              <tr key={e.id} className="border-t hover:bg-gray-50">
                <td className="p-3 text-gray-600 whitespace-nowrap">
                  {new Date(e.time).toLocaleString("tr-TR")}
                </td>
                <td className="p-3 font-medium">{e.vehicle?.chassisNo ?? e.vehicleId}</td>
                <td className="p-3">
                  <SourceBadge source={e.source} />
                </td>
                <td className="p-3 font-mono">{e.emcyCodeHex}</td>
                <td className="p-3 text-gray-700">{e.description}</td>
                <td className="p-3">
                  <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", sevStyle[e.severity])}>
                    {e.severity}
                  </span>
                </td>
                <td className="p-3">
                  {e.active ? (
                    <span className="text-red-600 font-semibold">Aktif</span>
                  ) : (
                    <span className="text-gray-400">Temizlendi</span>
                  )}
                </td>
                <td className="p-3">
                  {e.active && (
                    <button
                      onClick={() => clearMut.mutate(e.id)}
                      className="text-xs text-brand-dark hover:underline"
                    >
                      Temizle
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(data?.items ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-400">
                  Kayıt yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
