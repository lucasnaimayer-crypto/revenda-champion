import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export const classeCampo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:bg-zinc-100";

export function Campo({ rotulo, dica, ...props }: InputHTMLAttributes<HTMLInputElement> & { rotulo: string; dica?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-zinc-800">{rotulo}</span>
      <input className={classeCampo} {...props} />
      {dica && <span className="block text-xs text-zinc-500">{dica}</span>}
    </label>
  );
}

export function Selecao({
  rotulo,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { rotulo: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-zinc-800">{rotulo}</span>
      <select className={classeCampo} {...props}>
        {children}
      </select>
    </label>
  );
}

export function Botao({
  variante = "primario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "primario" | "secundario" | "perigo" }) {
  const estilos = {
    primario: "bg-zinc-900 text-white hover:bg-zinc-700",
    secundario: "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
    perigo: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  }[variante];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${estilos} ${className}`}
      {...props}
    />
  );
}

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-zinc-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function Aviso({ tipo = "erro", children }: { tipo?: "erro" | "ok" | "info"; children: ReactNode }) {
  const estilos = {
    erro: "border-red-200 bg-red-50 text-red-800",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-amber-200 bg-amber-50 text-amber-900",
  }[tipo];
  return <p className={`rounded-lg border px-3 py-2 text-sm ${estilos}`}>{children}</p>;
}

export function Titulo({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{children}</h1>
      {acao}
    </div>
  );
}
