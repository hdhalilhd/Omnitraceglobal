import clsx from "clsx";

type Src = "traction" | "pump" | "TRACTION" | "PUMP";

export function sourceLabel(s: Src): string {
  return s.toLowerCase() === "traction" ? "Yürüyüş" : "Pompa";
}

export default function SourceBadge({ source }: { source: Src }) {
  const isTraction = source.toLowerCase() === "traction";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        isTraction ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700",
      )}
    >
      {isTraction ? "Yürüyüş" : "Pompa"}
    </span>
  );
}
