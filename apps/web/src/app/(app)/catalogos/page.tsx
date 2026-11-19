import Link from "next/link";
import { Cartao, Titulo } from "@/componentes/ui";
import { exigirDono } from "@/lib/sessao";

const STATUS: Record<string, string> = { processando: "Processando", pronto: "Pronto", erro: "Com erro" };

export default async function Catalogos() {
  const { supabase, revendedor } = await exigirDono();
  const { data, error } = await supabase
    .from("catalogo")
    .select("id, nome, status, total_paginas, total_pecas, criado_em")
    .eq("revendedor_id", revendedor.id)
    .order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return (
    <>
      <Titulo
        acao={
          <Link href="/catalogos/novo" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
            Subir catálogo
          </Link>
        }
      >
        Catálogos
      </Titulo>
      {data.length === 0 ? (
        <Cartao>
          <p className="text-sm text-zinc-500">Nenhum catálogo ainda. Suba o PDF que o representante enviou.</p>
        </Cartao>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">Peças</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Páginas</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Enviado em</th>
                <th className="px-4 py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link href={`/catalogos/${c.id}`} className="font-medium hover:underline">
                      {c.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.total_pecas}</td>
                  <td className="hidden px-4 py-3 tabular-nums sm:table-cell">{c.total_paginas}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">{new Date(c.criado_em).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3">{STATUS[c.status] ?? c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
