import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Truck, Search, X } from "lucide-react";
import { api } from "../lib/api";
import { Vehicle } from "../types";
import { StatusDot } from "./Home";

export default function Machines() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["vehicles"],
    queryFn: async () => (await api.get("/vehicles")).data,
  });

  const filtered = vehicles.filter(
    (v) =>
      v.chassisNo.toLowerCase().includes(search.toLowerCase()) ||
      (v.model ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (v.name ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-700">Makineler</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white rounded-lg px-4 py-2 text-sm font-semibold"
        >
          <Plus size={18} /> Yeni Araç Ekle
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-3 flex items-center gap-2">
        <Search size={18} className="text-gray-400" />
        <input
          placeholder="Şase no, model"
          className="flex-1 outline-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="p-3">Araç</th>
              <th className="p-3">Şase No</th>
              <th className="p-3">Tip</th>
              <th className="p-3">Model</th>
              <th className="p-3">Durum</th>
              <th className="p-3">Çalışma (sa.)</th>
              <th className="p-3">Konum</th>
              <th className="p-3">Uyarı</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr
                key={v.id}
                onClick={() => navigate(`/machines/${v.id}`)}
                className="border-t hover:bg-gray-50 cursor-pointer"
              >
                <td className="p-3 text-gray-300">
                  <Truck size={28} />
                </td>
                <td className="p-3 font-semibold">{v.chassisNo}</td>
                <td className="p-3 text-gray-600">{v.type}</td>
                <td className="p-3 text-gray-600">{v.model ?? "-"}</td>
                <td className="p-3">
                  <StatusDot status={v.status} />
                </td>
                <td className="p-3 text-gray-600">{v.totalHours.toFixed(1)}</td>
                <td className="p-3 text-gray-600">{v.locationLabel ?? "-"}</td>
                <td className="p-3">
                  {(v.activeErrorCount ?? 0) > 0 ? (
                    <span className="bg-red-100 text-red-600 rounded-full px-2 py-0.5 text-xs font-semibold">
                      {v.activeErrorCount} Uyarı
                    </span>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-400">
                  Araç bulunamadı
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <NewVehicleModal
          onClose={() => setShowForm(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["vehicles"] });
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

function NewVehicleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    chassisNo: "",
    model: "",
    name: "",
    type: "Electric Forklift",
    tractionNodeId: 14,
    pumpNodeId: 22,
    locationLabel: "",
  });
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async () => (await api.post("/vehicles", form)).data,
    onSuccess: onSaved,
    onError: (e: any) => setError(e.response?.data?.error ?? "Kayıt başarısız"),
  });

  const upd = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[480px] max-w-[95vw] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-700">Yeni Araç Ekle</h2>
          <button onClick={onClose}>
            <X className="text-gray-400" />
          </button>
        </div>
        {error && <div className="bg-red-50 text-red-600 text-sm rounded p-2">{error}</div>}

        <Field label="Şase No *" placeholder="örn. 304MB100104" value={form.chassisNo} onChange={(v) => upd("chassisNo", v)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Model" value={form.model} onChange={(v) => upd("model", v)} />
          <Field label="Ad / Etiket" value={form.name} onChange={(v) => upd("name", v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Yürüyüş Node ID" type="number" value={String(form.tractionNodeId)} onChange={(v) => upd("tractionNodeId", Number(v))} />
          <Field label="Pompa Node ID" type="number" value={String(form.pumpNodeId)} onChange={(v) => upd("pumpNodeId", Number(v))} />
        </div>
        <Field label="Konum" value={form.locationLabel} onChange={(v) => upd("locationLabel", v)} />

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-gray-500">
            İptal
          </button>
          <button
            disabled={mutation.isPending || form.chassisNo.length < 3}
            onClick={() => mutation.mutate()}
            className="bg-brand hover:bg-brand-dark text-white rounded-lg px-5 py-2 font-semibold disabled:opacity-60"
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-sm text-gray-600">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        className="w-full border rounded-lg px-3 py-2 mt-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
