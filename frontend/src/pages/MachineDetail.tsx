import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Responsive, WidthProvider, Layout } from "react-grid-layout";
import { ArrowLeft, SlidersHorizontal, HeartPulse } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { Vehicle, SignalDef, Widget, TelemetryEvent } from "../types";
import Gauge from "../components/Gauge";
import SourceBadge from "../components/SourceBadge";
import AddRemoveModal from "../components/AddRemoveModal";
import { STATUS_LABELS } from "../lib/statusLabels";
import { StatusDot } from "./Home";

const Grid = WidthProvider(Responsive);

type Filter = "all" | "traction" | "pump";

interface DashboardResp {
  vehicleId: number;
  widgets: Widget[];
  signals: SignalDef[];
}

export default function MachineDetail() {
  const { id } = useParams();
  const vehicleId = Number(id);
  const qc = useQueryClient();

  const [filter, setFilter] = useState<Filter>("all");
  const [showModal, setShowModal] = useState(false);
  const [live, setLive] = useState<Record<string, { value: number; ts: number }>>({});
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);
  const [beat, setBeat] = useState(0); // animasyon tetikleyici

  const { data: vehicle } = useQuery<Vehicle>({
    queryKey: ["vehicle", vehicleId],
    queryFn: async () => (await api.get(`/vehicles/${vehicleId}`)).data,
  });

  const { data: dash } = useQuery<DashboardResp>({
    queryKey: ["dashboard", vehicleId],
    queryFn: async () => (await api.get(`/dashboard/${vehicleId}`)).data,
  });

  // İlk yükleme: son bilinen değerler
  useEffect(() => {
    if (vehicle?.latest) {
      const init: Record<string, { value: number; ts: number }> = {};
      for (const l of vehicle.latest) init[l.signalKey] = { value: l.value, ts: l.ts };
      setLive((prev) => ({ ...init, ...prev }));
    }
  }, [vehicle]);

  // Canlı WebSocket
  useEffect(() => {
    const socket = getSocket();
    socket.emit("subscribe:vehicle", vehicleId);
    const onTelemetry = (e: TelemetryEvent) => {
      if (e.vehicleId !== vehicleId) return;
      setLive((prev) => {
        const next = { ...prev };
        for (const s of e.signals) next[s.signalKey] = { value: s.value, ts: e.ts };
        return next;
      });
    };
    const onHeartbeat = (e: { vehicleId: number; ts?: number }) => {
      if (e.vehicleId !== vehicleId) return;
      setLastHeartbeat(e.ts ?? Date.now());
      setBeat((b) => b + 1);
    };
    socket.on("telemetry", onTelemetry);
    socket.on("heartbeat", onHeartbeat);
    return () => {
      socket.emit("unsubscribe:vehicle", vehicleId);
      socket.off("telemetry", onTelemetry);
      socket.off("heartbeat", onHeartbeat);
    };
  }, [vehicleId]);

  const signalsByKey = useMemo(
    () => new Map((dash?.signals ?? []).map((s) => [s.key, s])),
    [dash],
  );

  const saveLayout = useMutation({
    mutationFn: async (widgets: Widget[]) =>
      (await api.put(`/dashboard/${vehicleId}`, { widgets })).data,
    onSuccess: (data) => qc.setQueryData<DashboardResp>(["dashboard", vehicleId], (old) =>
      old ? { ...old, widgets: data.widgets } : old,
    ),
  });

  const widgets = dash?.widgets ?? [];

  // Filtreye göre görünür widget'lar
  const visible = widgets.filter((w) => {
    if (filter === "all") return true;
    const s = signalsByKey.get(w.signalKey);
    return s ? s.source.toLowerCase() === filter : true;
  });

  const gridLayout: Layout[] = visible.map((w) => ({
    i: w.signalKey,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
  }));

  // Sürükle/boyutlandır bittiğinde kaydet (gizli widget'ları koru)
  function persist(layout: Layout[]) {
    const posByKey = new Map(layout.map((l) => [l.i, l]));
    const merged = widgets.map((w) => {
      const p = posByKey.get(w.signalKey);
      return p ? { ...w, x: p.x, y: p.y, w: p.w, h: p.h } : w;
    });
    saveLayout.mutate(merged);
  }

  // Ekle/Kaldır kaydı
  function onModalSave(keys: string[]) {
    const existing = new Map(widgets.map((w) => [w.signalKey, w]));
    let nextY = 0;
    const next: Widget[] = keys.map((k, i) => {
      const prev = existing.get(k);
      if (prev) return prev;
      const s = signalsByKey.get(k);
      const type: Widget["type"] = s && s.min != null && s.max != null ? "gauge" : "number";
      const x = (i % 4) * 3;
      const y = Math.floor(i / 4) * 2 + nextY;
      return { signalKey: k, type, x, y, w: 3, h: 2 };
    });
    saveLayout.mutate(next);
    setShowModal(false);
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Tümü" },
    { key: "traction", label: "Yürüyüş" },
    { key: "pump", label: "Pompa" },
  ];

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/machines" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft />
          </Link>
          <div>
            <div className="text-xl font-bold text-gray-700">{vehicle?.chassisNo}</div>
            <div className="text-sm text-gray-400">
              {vehicle?.name ?? vehicle?.model ?? vehicle?.type}
            </div>
          </div>
          {vehicle && <StatusDot status={vehicle.status} />}
          <HeartbeatBadge lastHeartbeat={lastHeartbeat} beat={beat} />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-white border hover:bg-gray-50 rounded-lg px-4 py-2 text-sm font-semibold text-gray-600"
        >
          <SlidersHorizontal size={18} /> Gösterge Ekle/Kaldır
        </button>
      </div>

      {/* Kaynak filtresi */}
      <div className="flex gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={clsx(
              "rounded-full px-4 py-1.5 text-sm font-medium border",
              filter === f.key
                ? "bg-brand text-white border-brand"
                : "bg-white text-gray-600 hover:bg-gray-50",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Gösterge ızgarası */}
      {visible.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">
          Gösterge yok. "Gösterge Ekle/Kaldır" ile ekleyin.
        </div>
      ) : (
        <Grid
          className="layout"
          layouts={{ lg: gridLayout, md: gridLayout, sm: gridLayout }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={80}
          onDragStop={(l) => persist(l)}
          onResizeStop={(l) => persist(l)}
          draggableCancel=".no-drag"
        >
          {visible.map((w) => {
            const s = signalsByKey.get(w.signalKey);
            const v = live[w.signalKey];
            return (
              <div key={w.signalKey}>
                <WidgetCard widget={w} signal={s} value={v?.value} ts={v?.ts} />
              </div>
            );
          })}
        </Grid>
      )}

      {showModal && dash && (
        <AddRemoveModal
          signals={dash.signals}
          activeKeys={widgets.map((w) => w.signalKey)}
          onClose={() => setShowModal(false)}
          onSave={onModalSave}
        />
      )}
    </div>
  );
}

function HeartbeatBadge({ lastHeartbeat, beat }: { lastHeartbeat: number | null; beat: number }) {
  // Bayatlık (10 sn) güncel kalsın diye periyodik yeniden çizim
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const stale = !lastHeartbeat || Date.now() - lastHeartbeat > 10000;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border",
        stale ? "bg-gray-50 text-gray-400 border-gray-200" : "bg-green-50 text-green-700 border-green-200",
      )}
      title="Cihaz heartbeat sinyali"
    >
      <HeartPulse
        key={beat}
        size={15}
        className={stale ? "text-gray-300" : "text-green-500 animate-[pulse_0.6s_ease-in-out_1]"}
      />
      {lastHeartbeat
        ? `Heartbeat: ${new Date(lastHeartbeat).toLocaleTimeString("tr-TR")}`
        : "Sinyal bekleniyor…"}
    </span>
  );
}

function WidgetCard({
  widget,
  signal,
  value,
  ts,
}: {
  widget: Widget;
  signal?: SignalDef;
  value?: number;
  ts?: number;
}) {
  const label = signal?.label ?? widget.signalKey;
  const unit = signal?.unit ?? "";
  const decimals = signal?.decimals ?? 0;
  const hasValue = value !== undefined;
  // Durum sinyali ise sayı yerine metin (Dolu/Boş, İleri/Geri…)
  const statusMap = STATUS_LABELS[widget.signalKey];
  const statusText =
    hasValue && statusMap ? statusMap[Math.round(value!)] ?? String(Math.round(value!)) : undefined;

  return (
    <div className="bg-white rounded-xl shadow-sm h-full p-3 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-600 truncate">{label}</span>
        {signal && <SourceBadge source={signal.source} />}
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center">
        {!hasValue ? (
          <span className="text-gray-300 text-sm">veri yok</span>
        ) : statusText !== undefined ? (
          <div className="text-2xl font-bold text-gray-800 text-center">{statusText}</div>
        ) : widget.type === "gauge" && signal?.min != null && signal?.max != null ? (
          <Gauge value={value!} min={signal.min} max={signal.max} unit={unit} decimals={decimals} />
        ) : (
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-800">{value!.toFixed(decimals)}</div>
            <div className="text-gray-400 text-sm">{unit}</div>
          </div>
        )}
      </div>

      <div className="text-[10px] text-gray-300 text-right">
        {ts ? new Date(ts).toLocaleTimeString("tr-TR") : ""}
      </div>
    </div>
  );
}
