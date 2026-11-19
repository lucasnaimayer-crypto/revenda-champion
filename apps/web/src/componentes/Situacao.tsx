const SITUACOES: Record<string, { rotulo: string; cor: string }> = {
  rascunho: { rotulo: "Rascunho", cor: "bg-zinc-100 text-zinc-700" },
  enviado: { rotulo: "Enviado", cor: "bg-amber-100 text-amber-800" },
  confirmado: { rotulo: "Confirmado", cor: "bg-sky-100 text-sky-800" },
  recebido: { rotulo: "Recebido", cor: "bg-emerald-100 text-emerald-800" },
  cancelado: { rotulo: "Cancelado", cor: "bg-red-100 text-red-700" },
};

export default function Situacao({ status }: { status: string }) {
  const s = SITUACOES[status] ?? { rotulo: status, cor: "bg-zinc-100 text-zinc-700" };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cor}`}>{s.rotulo}</span>;
}
