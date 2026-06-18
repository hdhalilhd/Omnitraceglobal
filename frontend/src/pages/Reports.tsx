import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Download } from "lucide-react";
import { api } from "../lib/api";
import { Vehicle, SignalDef } from "../types";
import SourceBadge from "../components/SourceBadge";

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Point {
  t: string;
  avg: number | null;
  min: number | null;
  max: number | null;
}

export default function Reports() {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [vehicleId, setVehicleId] = useState<string>("");
  const [signalKey, setSignalKey] = useState<string>("");
  const [from, setFrom] = useState(toLocalInput(hourAgo));
  const [to, setTo] = useState(toLocalInput(now));
  const [bucket, setBucket] = useState("1m");
  const [submitted, setSubmitted] = useState<null | {
    vehicleId: string;
    signalKey: string;
    from: string;
    to: string;
    bucket: string;
  }>(null);

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["vehicles"],
    queryFn: async () => (await api.get("/vehicles")).data,
  });
  const { data: signals = [] } = useQuery<SignalDef[]>({
    queryKey: ["signals"],
    queryFn: async () => (await api.get("/signals")).data,
  });

  const { data: report, isFetching } = useQuery<{ points: Point[] }>({
    queryKey: ["report", submitted],
    enabled: !!submitted,
    queryFn: async () =>
      (
        await api.get(`/reports/${submitted!.vehicleId}`, {
          params: {
            signalKey: submitted!.signalKey,
            from: new Date(submitted!.from).toISOString(),
            to: new Date(submitted!.to).toISOString(),
            bucket: submitted!.bucket,
          },
        })
      ).data,
  });

  const selectedSignal = signals.find((s) => s.key === signalKey);

  const chartData = useMemo(
    () =>
      (report?.points ?? []).map((p) => ({
        time: new Date(p.t).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
        avg: p.avg,
      })),
    [report],
  );

  async function downloadCsv() {
    if (!submitted) return;
    const res = await api.get(`/reports/${submitted.vehicleId}/export.csv`, {
      params: {
        signalKey: submitted.signalKey,
        from: new Date(submitted.from).toISOString(),
        to: new Date(submitted.to).toISOString(),
        bucket: submitted.bucket,
      },
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapor_${submitted.signalKey}_${submitted.bucket}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canSubmit = vehicleId && signalKey;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-700">Raporlar</h1>

      <div className="bg-white rounded-xl shadow-sm p-4 grid grid-cols-1 md:grid-cols-6 gap-3 text-sm items-end">
        <div className="md:col-span-1">
          <label className="text-gray-500">Araç</label>
          <select className="w-full border rounded-lg px-2 py-2 mt-1" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Seçin</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.chassisNo}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-gray-500">Parametre</label>
          <select className="w-full border rounded-lg px-2 py-2 mt-1" value={signalKey} onChange={(e) => setSignalKey(e.target.value)}>
            <option value="">Seçin</option>
            {signals.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label} ({s.source === "TRACTION" ? "Yürüyüş" : "Pompa"})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-gray-500">Başlangıç</label>
          <input type="datetime-local" className="w-full border rounded-lg px-2 py-2 mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-gray-500">Bitiş</label>
          <input type="datetime-local" className="w-full border rounded-lg px-2 py-2 mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="text-gray-500">Çözünürlük</label>
          <select className="w-full border rounded-lg px-2 py-2 mt-1" value={bucket} onChange={(e) => setBucket(e.target.value)}>
            <option value="raw">Ham (1 sn)</option>
            <option value="1m">1 dakika</option>
            <option value="1h">1 saat</option>
          </select>
        </div>
        <div className="md:col-span-6 flex gap-2">
          <button
            disabled={!canSubmit}
            onClick={() => setSubmitted({ vehicleId, signalKey, from, to, bucket })}
            className="bg-brand hover:bg-brand-dark text-white rounded-lg px-5 py-2 font-semibold disabled:opacity-50"
          >
            Raporla
          </button>
          {submitted && (
            <button
              onClick={downloadCsv}
              className="flex items-center gap-2 border rounded-lg px-4 py-2 text-gray-600 hover:bg-gray-50"
            >
              <Download size={16} /> CSV
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-semibold text-gray-600">{selectedSignal?.label ?? "Seçim yok"}</span>
          {selectedSignal && <SourceBadge source={selectedSignal.source} />}
          {selectedSignal?.unit && <span className="text-gray-400 text-sm">({selectedSignal.unit})</span>}
        </div>
        {isFetching ? (
          <div className="h-72 flex items-center justify-center text-gray-400">Yükleniyor…</div>
        ) : chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-gray-300">
            {submitted ? "Bu aralıkta veri yok" : "Rapor oluşturmak için seçim yapın"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="time" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="avg" stroke="#F5A623" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
