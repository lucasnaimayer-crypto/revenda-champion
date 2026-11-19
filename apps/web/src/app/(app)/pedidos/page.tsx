import Link from "next/link";
import { formatarReais } from "@revenda/regras";
import Situacao from "@/componentes/Situacao";
import { Cartao, Titulo } from "@/componentes/ui";
import { exigirDono } from "@/lib/sessao";

export default async function Pedidos() {
  const { supabase, revendedor } = await exigirDono();
  const { data, error } = await supabase
    .from("pedido")
    .select("id, numero, nome, status, criado_em, pedido_item (quantidade, custo, preco_venda, lucro)")
    .eq("revendedor_id", revendedor.id)
    .order("numero", { ascending: false });
  if (error) throw new Error(error.message);
  return (
    <>
      <Titulo
        acao={
          <Link href="/catalogos" className="rounded-lg bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escura">
            Montar pedido
          </Link>
        }
      >
        Pedidos
      </Titulo>
      {data.length === 0 ? (
        <Cartao>
          <p className="text-sm text-zinc-500">Nenhum pedido ainda. Abra um catálogo e toque nas peças que você quer; dá para juntar peças de vários catálogos no mesmo pedido.</p>
        </Cartao>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nº</th>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">Peças</th>
                <th className="px-4 py-2 font-medium">Custo</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">Lucro previsto</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Criado em</th>
                <th className="px-4 py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => {
                const itens = (p.pedido_item ?? []) as { quantidade: number; custo: number; lucro: number }[];
                const pecas = itens.reduce((s, i) => s + i.quantidade, 0);
                return (
                  <tr key={p.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-3 tabular-nums">{p.numero}</td>
                    <td className="px-4 py-3">
                      <Link href={`/pedidos/${p.id}`} className="font-medium hover:underline">
                        {p.nome}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{pecas}</td>
                    <td className="px-4 py-3 tabular-nums">{formatarReais(itens.reduce((s, i) => s + i.custo * i.quantidade, 0))}</td>
                    <td className="hidden px-4 py-3 tabular-nums text-emerald-700 md:table-cell">
                      {formatarReais(itens.reduce((s, i) => s + i.lucro * i.quantidade, 0))}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">{new Date(p.criado_em).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-3">
                      <Situacao status={p.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
