import Link from "next/link";
import { notFound } from "next/navigation";
import { formatarReais, resultadoDaVenda, rotuloFormaPagamento } from "@revenda/regras";
import Situacao from "@/componentes/Situacao";
import { Aviso, Cartao, Titulo } from "@/componentes/ui";
import { BotaoParcela, CancelarVenda, DevolverVenda } from "@/componentes/venda/AcoesVenda";
import { urlsAssinadas } from "@/lib/arquivos";
import { formatarData, hojeISO, linkWhatsapp } from "@/lib/datas";
import { exigirDono } from "@/lib/sessao";

export default async function Venda({ params }: PageProps<"/vendas/[id]">) {
  const { id } = await params;
  const { supabase } = await exigirDono();
  const { data: venda } = await supabase
    .from("venda")
    .select("*, cliente:cliente_id (id, nome, telefone)")
    .eq("id", id)
    .maybeSingle();
  if (!venda) notFound();
  const [{ data: itens }, { data: parcelas }, { data: devolucoes }] = await Promise.all([
    supabase.from("venda_item").select("*").eq("venda_id", id).order("codigo"),
    supabase.from("recebimento").select("id, parcela, valor, vencimento, status, recebido_em").eq("venda_id", id).order("parcela"),
    supabase.from("venda_devolucao").select("id, data, motivo, pecas, receita, abatido, reembolso, comissao_revertida").eq("venda_id", id).order("criado_em"),
  ]);
  const urls = await urlsAssinadas(supabase, (itens ?? []).map((i) => i.imagem_path));
  const cliente = venda.cliente as unknown as { id: string; nome: string; telefone: string | null } | null;
  const hoje = hojeISO();
  const r = resultadoDaVenda({
    status: venda.status,
    pecas: venda.pecas,
    totalLiquido: venda.total_liquido,
    custoTotal: venda.custo_total,
    comissaoTotal: venda.comissao_total,
    devolvidoPecas: venda.devolvido_pecas,
    devolvidoReceita: venda.devolvido_receita,
    devolvidoCusto: venda.devolvido_custo,
    comissaoRevertida: venda.comissao_revertida,
  });
  const comissoes = (venda.comissoes ?? []) as { nome: string; percentual_bp: number; valor: number }[];
  const pendente = (parcelas ?? []).filter((p) => p.status === "pendente").reduce((s, p) => s + p.valor, 0);
  const pagoNoCancelamento = venda.status === "cancelada" ? (parcelas ?? []).filter((p) => p.status === "recebido").reduce((s, p) => s + p.valor, 0) : 0;
  const aberta = venda.status === "concluida" || venda.status === "parcialmente_devolvida";
  const whatsapp = linkWhatsapp(cliente?.telefone);

  return (
    <>
      <Titulo>
        <span className="flex flex-wrap items-center gap-3">
          Venda nº {venda.numero} <Situacao status={venda.status} />
        </span>
      </Titulo>
      <p className="-mt-4 mb-6 text-sm text-zinc-500">
        {formatarData(venda.data)} · {rotuloFormaPagamento(venda.forma_pagamento)}
        {cliente && (
          <>
            {" · "}
            <Link href={`/clientes/${cliente.id}`} className="font-medium text-zinc-900 hover:underline">
              {cliente.nome}
            </Link>
            {whatsapp && (
              <>
                {" · "}
                <a href={whatsapp} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
                  WhatsApp
                </a>
              </>
            )}
          </>
        )}
      </p>

      {venda.status === "cancelada" && (
        <div className="mb-6">
          <Aviso tipo="info">
            Cancelada em {new Date(venda.cancelada_em!).toLocaleDateString("pt-BR")}: {venda.motivo_cancelamento}.
            {pagoNoCancelamento > 0 && ` O cliente já tinha pago ${formatarReais(pagoNoCancelamento)}, que deve ser devolvido.`}
          </Aviso>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Peça</th>
                  <th className="px-3 py-2 font-medium">Qtd.</th>
                  <th className="px-3 py-2 font-medium">Preço</th>
                  <th className="px-3 py-2 font-medium">Subtotal</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">Custo</th>
                </tr>
              </thead>
              <tbody>
                {(itens ?? []).map((i) => {
                  const url = i.imagem_path ? urls.get(i.imagem_path) : undefined;
                  return (
                    <tr key={i.id} className="border-t border-zinc-100">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-3">
                          <div className="h-14 w-11 shrink-0 overflow-hidden rounded bg-zinc-100">
                            {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage */}
                            {url && <img src={url} alt="" className="h-full w-full object-contain" />}
                          </div>
                          <div>
                            {i.produto_id ? (
                              <Link href={`/estoque/${i.produto_id}`} className="font-mono hover:underline">
                                {i.codigo}
                              </Link>
                            ) : (
                              <span className="font-mono">{i.codigo}</span>
                            )}
                            {i.descricao && <p className="text-xs text-zinc-500">{i.descricao}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {i.quantidade}
                        {i.quantidade_devolvida > 0 && <span className="block text-xs text-amber-700">{i.quantidade_devolvida} devolvida(s)</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{formatarReais(i.preco_unitario)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatarReais(i.subtotal)}</td>
                      <td className="hidden px-3 py-2 tabular-nums text-zinc-500 sm:table-cell">{formatarReais(i.custo_total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(parcelas ?? []).length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold">Recebimentos</h2>
              <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
                <table className="w-full text-sm">
                  <tbody>
                    {(parcelas ?? []).map((p) => {
                      const atrasada = p.status === "pendente" && p.vencimento < hoje;
                      return (
                        <tr key={p.id} className="border-t border-zinc-100 first:border-t-0">
                          <td className="px-3 py-2">Parcela {p.parcela}</td>
                          <td className="px-3 py-2">
                            {p.status === "recebido" ? `recebida em ${formatarData(p.recebido_em)}` : `vence ${formatarData(p.vencimento)}`}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{formatarReais(p.valor)}</td>
                          <td className="px-3 py-2">
                            <Situacao status={atrasada ? "atrasado" : p.status} />
                          </td>
                          <td className="px-3 py-2 text-right">{p.status !== "cancelado" && <BotaoParcela id={p.id} recebido={p.status === "recebido"} hoje={hoje} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {(devolucoes ?? []).length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold">Devoluções</h2>
              <ul className="space-y-2">
                {(devolucoes ?? []).map((d) => (
                  <li key={d.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">
                    <p>
                      <strong>{formatarData(d.data)}</strong> · {d.pecas} peça(s) · {formatarReais(d.receita)} · {d.motivo}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {d.abatido > 0 && `${formatarReais(d.abatido)} tirado das parcelas. `}
                      {d.reembolso > 0 && `${formatarReais(d.reembolso)} devolvido ao cliente. `}
                      {d.comissao_revertida > 0 && `Comissão revertida: ${formatarReais(d.comissao_revertida)}.`}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {venda.observacao && <p className="text-sm text-zinc-500">Observação: {venda.observacao}</p>}
        </div>

        <aside className="space-y-4">
          <Cartao>
            <dl className="space-y-1 text-sm">
              <Linha rotulo="Total das peças" valor={formatarReais(venda.total_bruto)} />
              {venda.desconto > 0 && <Linha rotulo="Desconto" valor={`− ${formatarReais(venda.desconto)}`} />}
              <Linha rotulo="Total da venda" valor={formatarReais(venda.total_liquido)} forte />
              {venda.devolvido_receita > 0 && <Linha rotulo="Devolvido" valor={`− ${formatarReais(venda.devolvido_receita)}`} />}
              <Linha rotulo="Custo das peças" valor={formatarReais(r.custo)} fraco />
              {comissoes.map((c) => (
                <Linha key={c.nome} rotulo={`Comissão ${c.nome}`} valor={formatarReais(c.valor)} fraco />
              ))}
              {venda.comissao_revertida > 0 && <Linha rotulo="Comissão revertida" valor={`− ${formatarReais(venda.comissao_revertida)}`} fraco />}
              <div className={`flex justify-between border-t border-zinc-100 pt-2 font-semibold ${r.lucro >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                <dt>Lucro</dt>
                <dd className="tabular-nums">{formatarReais(r.lucro)}</dd>
              </div>
              {pendente > 0 && <Linha rotulo="Falta receber" valor={formatarReais(pendente)} forte />}
            </dl>
          </Cartao>
          {aberta && (
            <>
              <DevolverVenda
                vendaId={venda.id}
                hoje={hoje}
                dataVenda={venda.data}
                temComissao={venda.comissao_total > venda.comissao_revertida}
                itens={(itens ?? []).map((i) => ({
                  id: i.id,
                  codigo: i.codigo,
                  quantidade: i.quantidade,
                  quantidadeDevolvida: i.quantidade_devolvida,
                  subtotal: i.subtotal,
                  descontoRateado: i.desconto_rateado,
                  custoUnitario: i.custo_unitario,
                  comissao: i.comissao,
                }))}
              />
              {venda.status === "concluida" && <CancelarVenda vendaId={venda.id} temComissao={venda.comissao_total > 0} />}
            </>
          )}
        </aside>
      </div>
    </>
  );
}

function Linha({ rotulo, valor, forte, fraco }: { rotulo: string; valor: string; forte?: boolean; fraco?: boolean }) {
  return (
    <div className={`flex justify-between ${forte ? "font-semibold" : fraco ? "text-zinc-500" : ""}`}>
      <dt>{rotulo}</dt>
      <dd className="tabular-nums">{valor}</dd>
    </div>
  );
}
