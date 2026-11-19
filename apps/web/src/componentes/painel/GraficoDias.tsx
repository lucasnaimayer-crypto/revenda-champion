import { formatarReais } from "@revenda/regras";

/** Barras do faturamento por dia, com o valor ao passar o dedo ou o mouse. */
export default function GraficoDias({ dias, mes, hoje }: { dias: { dia: number; valor: number }[]; mes: string; hoje: string }) {
  const maximo = Math.max(...dias.map((d) => d.valor), 1);
  const [a, m] = mes.split("-");
  return (
    <figure>
      <div className="flex h-40 items-end gap-[2px]" role="list" aria-label="Faturamento por dia">
        {dias.map((d) => {
          const data = `${String(d.dia).padStart(2, "0")}/${m}`;
          const futuro = `${a}-${m}-${String(d.dia).padStart(2, "0")}` > hoje;
          const altura = d.valor > 0 ? Math.max(3, Math.round((d.valor / maximo) * 100)) : 0;
          return (
            <div key={d.dia} role="listitem" aria-label={`${data}: ${formatarReais(d.valor)}`} className="group relative flex h-full flex-1 items-end">
              <div
                className={`w-full rounded-t-[4px] ${d.valor > 0 ? "bg-zinc-800 group-hover:bg-zinc-600" : futuro ? "" : "border-b-2 border-zinc-200"}`}
                style={{ height: `${altura}%` }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs text-white shadow group-hover:block">
                {data} · {formatarReais(d.valor)}
              </div>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-1 flex justify-between text-xs text-zinc-400">
        <span>1</span>
        <span>{Math.ceil(dias.length / 2)}</span>
        <span>{dias.length}</span>
      </figcaption>
    </figure>
  );
}
