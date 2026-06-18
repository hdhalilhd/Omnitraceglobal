import { useMemo, useState } from "react";
import { X, ArrowRightLeft, Search } from "lucide-react";
import { SignalDef } from "../types";
import SourceBadge from "./SourceBadge";

interface Props {
  signals: SignalDef[];
  activeKeys: string[];
  onSave: (keys: string[]) => void;
  onClose: () => void;
}

export default function AddRemoveModal({ signals, activeKeys, onClose, onSave }: Props) {
  const [active, setActive] = useState<string[]>(activeKeys);
  const [search, setSearch] = useState("");

  const byKey = useMemo(() => new Map(signals.map((s) => [s.key, s])), [signals]);
  const available = signals.filter(
    (s) => !active.includes(s.key) && s.label.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[760px] max-w-[95vw] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-600">Gösterge Ekle/Kaldır</h2>
          <button onClick={onClose}>
            <X className="text-gray-400" />
          </button>
        </div>

        <div className="flex items-center gap-2 border rounded-lg px-3 py-2 mb-4">
          <Search size={18} className="text-gray-400" />
          <input
            className="flex-1 outline-none"
            placeholder="Aramak için yazmaya başlayın"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
          {/* Kullanılabilir */}
          <div className="bg-gray-50 rounded-xl p-3 h-80 overflow-auto">
            <div className="text-gray-500 font-semibold mb-2">Kullanılabilir Parametreler</div>
            {available.map((s) => (
              <button
                key={s.key}
                onClick={() => setActive((a) => [...a, s.key])}
                className="w-full text-left px-2 py-2 rounded hover:bg-white flex items-center justify-between"
              >
                <span className="text-sm text-gray-700">{s.label}</span>
                <SourceBadge source={s.source} />
              </button>
            ))}
            {available.length === 0 && <div className="text-gray-300 text-sm px-2">—</div>}
          </div>

          <ArrowRightLeft className="text-gray-300" />

          {/* Mevcut */}
          <div className="bg-gray-50 rounded-xl p-3 h-80 overflow-auto">
            <div className="text-gray-500 font-semibold mb-2">Mevcut Parametreler</div>
            {active.map((k) => {
              const s = byKey.get(k);
              if (!s) return null;
              return (
                <button
                  key={k}
                  onClick={() => setActive((a) => a.filter((x) => x !== k))}
                  className="w-full text-left px-2 py-2 rounded hover:bg-white flex items-center justify-between"
                >
                  <span className="text-sm text-gray-700">{s.label}</span>
                  <SourceBadge source={s.source} />
                </button>
              );
            })}
            {active.length === 0 && <div className="text-gray-300 text-sm px-2">—</div>}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-gray-500">
            İptal
          </button>
          <button
            onClick={() => onSave(active)}
            className="bg-brand hover:bg-brand-dark text-white rounded-lg px-6 py-2 font-semibold"
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
