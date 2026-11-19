"use client";

import { useActionState, useState } from "react";
import { receberPedido, type Resultado } from "../../acoes";
import { Aviso, Botao } from "@/componentes/ui";

export interface ItemReceber {
  id: string;
  codigo: string;
  quantidade: number;
  url: string | null;
}

export default function FormReceber({ pedidoId, itens }: { pedidoId: string; itens: ItemReceber[] }) {
  const [estado, acao, ocupado] = useActionState<Resultado, FormData>(receberPedido, {});
  const [recebidos, setRecebidos] = useState<Record<string, number>>(() => Object.fromEntries(itens.map((i) => [i.id, i.quantidade])));
  const total = Object.values(recebidos).reduce((s, q) => s + q, 0);
  const pedidas = itens.reduce((s, i) => s + i.quantidade, 0);
  const diferencas = itens.filter((i) => recebidos[i.id] !== i.quantidade).length;

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="pedido_id" value={pedidoId} />
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Peça</th>
              <th className="px-3 py-2 font-medium">Pedidas</th>
              <th className="px-3 py-2 font-medium">Chegaram</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id} className="border-t border-zinc-100">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-11 shrink-0 overflow-hidden rounded bg-zinc-100">
                      {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage */}
                      {i.url && <img src={i.url} alt="" className="h-full w-full object-contain" />}
                    </div>
                    <span className="font-mono">{i.codigo}</span>
                  </div>
                </td>
                <td className="px-3 py-2 tabular-nums">{i.quantidade}</td>
                <td className="px-3 py-2">
                  <input
                    name={`recebido:${i.id}`}
                    type="number"
                    min={0}
                    max={10000}
                    value={recebidos[i.id]}
                    onChange={(e) => setRecebidos((r) => ({ ...r, [i.id]: Math.max(0, Number(e.target.value) || 0) }))}
                    className={`w-20 rounded-lg border px-2 py-1 tabular-nums ${recebidos[i.id] !== i.quantidade ? "border-amber-400 bg-amber-50" : "border-zinc-300"}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      <div className="flex flex-wrap items-center gap-4">
        <Botao type="submit" disabled={ocupado}>
          {ocupado ? "Lançando no estoque…" : `Confirmar recebimento de ${total} peças`}
        </Botao>
        <span className="text-sm text-zinc-500">
          {pedidas} pedidas{diferencas > 0 ? ` · ${diferencas} ${diferencas === 1 ? "peça com diferença" : "peças com diferença"}` : ""}
        </span>
      </div>
    </form>
  );
}
