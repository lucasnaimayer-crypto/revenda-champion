import Link from "next/link";
import { notFound } from "next/navigation";
import { formatarReais } from "@revenda/regras";
import { FormAjuste, FormProduto } from "@/componentes/estoque/FormsEstoque";
import { Cartao, Titulo } from "@/componentes/ui";
import { urlsAssinadas } from "@/lib/arquivos";
import { carregarAjustes, precificar } from "@/lib/produtos";
import { carregarRegras } from "@/lib/regras";
import { exigirRevendedor } from "@/lib/sessao";

const TIPOS: Record<string, string> = { entrada: "Entrada", venda: "Venda", devolucao: "Devolução", ajuste: "Ajuste" };

export default async function Produto({ params }: PageProps<"/estoque/[id]">) {
  const { id } = await params;
  const { supabase, revendedor, papel } = await exigirRevendedor();
  const dono = papel === "dono";
  const { data: produto } = await supabase.from("produto").select("id, codigo, descricao, custo, preco_manual, imagem_path").eq("id", id).maybeSingle();
  if (!produto) notFound();
  const [{ data: movimentos }, regras, ajustes] = await Promise.all([
    supabase.from("estoque_movimento").select("id, tipo, quantidade, motivo, origem_tipo, origem_id, criado_em").eq("produto_id", id).order("criado_em", { ascending: false }).limit(100),
    dono ? carregarRegras(supabase, revendedor.id) : Promise.resolve(null),
    dono ? carregarAjustes(supabase, revendedor.id) : Promise.resolve(null),
  ]);
  const saldo = (movimentos ?? []).reduce((s, m) => s + m.quantidade, 0);
  const { data: saldoBanco } = await supabase.from("estoque_saldo").select("saldo").eq("produto_id", id).maybeSingle();
  const urls = await urlsAssinadas(supabase, [produto.imagem_path]);
  const url = produto.imagem_path ? urls.get(produto.imagem_path) : undefined;
  const preco = regras ? precificar(produto, regras, ajustes?.get(id)) : null;

  return (
    <>
      <Titulo>
        <span className="font-mono">{produto.codigo}</span>
      </Titulo>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr_380px]">
        <div className="space-y-3">
          <div className="aspect-[3/4] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage */}
            {url ? <img src={url} alt={produto.codigo} className="h-full w-full object-contain" /> : <span className="flex h-full items-center justify-center text-sm text-zinc-400">sem foto</span>}
          </div>
          <Cartao>
            <p className="text-sm text-zinc-500">Em estoque</p>
            <p className="text-3xl font-semibold tabular-nums">{saldoBanco?.saldo ?? saldo}</p>
            {preco ? (
              <p className="mt-2 text-sm">
                Vende por <strong>{formatarReais(preco.precoVenda)}</strong>
              </p>
            ) : (
              produto.preco_manual != null && <p className="mt-2 text-sm">Vende por {formatarReais(produto.preco_manual)}</p>
            )}
          </Cartao>
        </div>

        <section>
          <h2 className="mb-2 font-semibold">Movimentações</h2>
          {(movimentos ?? []).length === 0 ? (
            <Cartao>
              <p className="text-sm text-zinc-500">Nenhuma movimentação.</p>
            </Cartao>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <tbody>
                  {(movimentos ?? []).map((m) => {
                    const link = !dono || !m.origem_id ? null : m.origem_tipo === "venda" ? `/vendas/${m.origem_id}` : m.origem_tipo === "pedido" ? `/pedidos/${m.origem_id}` : null;
                    return (
                      <tr key={m.id} className="border-t border-zinc-100 first:border-t-0">
                        <td className="px-3 py-2 text-zinc-500">{new Date(m.criado_em).toLocaleDateString("pt-BR")}</td>
                        <td className="px-3 py-2">{TIPOS[m.tipo] ?? m.tipo}</td>
                        <td className={`px-3 py-2 tabular-nums font-medium ${m.quantidade > 0 ? "text-emerald-700" : "text-red-700"}`}>
                          {m.quantidade > 0 ? "+" : ""}
                          {m.quantidade}
                        </td>
                        <td className="px-3 py-2 text-zinc-600">
                          {link ? (
                            <Link href={link} className="hover:underline">
                              {m.motivo}
                            </Link>
                          ) : (
                            m.motivo
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {dono && regras && (
          <div className="space-y-4">
            <Cartao>
              <h2 className="mb-3 font-semibold">Ajustar estoque</h2>
              <FormAjuste produtoId={produto.id} saldo={saldoBanco?.saldo ?? saldo} />
            </Cartao>
            <Cartao>
              <h2 className="mb-3 font-semibold">Preço e custos</h2>
              <FormProduto
                produtoId={produto.id}
                custo={produto.custo}
                descricao={produto.descricao}
                precoManual={produto.preco_manual}
                regra={regras.regra}
                tipos={regras.custos}
                ajustes={ajustes?.get(id) ?? {}}
              />
            </Cartao>
          </div>
        )}
      </div>
    </>
  );
}
