"use client";

import { usePathname, useRouter } from "next/navigation";

interface Opcao {
  id: string;
  numero: number;
  nome: string;
  pecas: number;
}

/** Escolhe em qual rascunho as peças entram: um existente ou um pedido novo. */
export default function EscolherPedido({ rascunhos, atual }: { rascunhos: Opcao[]; atual: string | null }) {
  const router = useRouter();
  const caminho = usePathname();
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-zinc-500">Colocando peças em</span>
      <select
        value={atual ?? "novo"}
        onChange={(e) => router.push(`${caminho}?pedido=${e.target.value}`)}
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 font-medium outline-none focus:border-marca"
      >
        {rascunhos.map((r) => (
          <option key={r.id} value={r.id}>
            Pedido nº {r.numero} · {r.pecas} {r.pecas === 1 ? "peça" : "peças"}
          </option>
        ))}
        <option value="novo">Um pedido novo</option>
      </select>
    </label>
  );
}
