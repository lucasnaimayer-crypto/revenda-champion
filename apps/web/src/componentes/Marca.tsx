/** Assinatura do app: "REVENDA CHAMPION" em caixa alta, no estilo da marca. */
export default function Marca({ claro = false, className = "" }: { claro?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 font-extrabold uppercase leading-none tracking-[0.18em] ${claro ? "text-white" : "text-tinta"} ${className}`}>
      <span className="font-semibold tracking-[0.12em] opacity-70">Revenda</span>
      <span>Champion</span>
    </span>
  );
}
