import Link from "next/link";
import { faturamentoPorDia, formatarReais, maisVendidos, pecasParadas, resumirVendas, variacaoBp, type VendaDoPainel } from "@revenda/regras";
import GraficoDias from "@/componentes/painel/GraficoDias";
import { Cartao, Titulo } from "@/componentes/ui";
import { urlsAssinadas } from "@/lib/arquivos";
import { formatarData, hojeISO, limitesDoMes, linkWhatsapp, mesISO, nomeDoMes, somarMesISO } from "@/lib/datas";
import { carregarAjustes, precificar } from "@/lib/produtos";
import { carregarRegras } from "@/lib/regras";
import { exigirRevendedor } from "@/lib/sessao";

const DIAS_PARADO = 60;

function paraVenda(v: Record<string, unknown>): VendaDoPainel {
  return {
    data: v.data as string,
    status: v.status as VendaDoPainel["status"],
    pecas: v.pecas as number,
    totalLiquido: v.total_liquido as number,
    custoTotal: v.custo_total as number,
    comissaoTotal: v.comissao_total as number,
    devolvidoPecas: v.devolvido_pecas as number,
    devolvidoReceita: v.devolvido_receita as number,
    devolvidoCusto: v.devolvido_custo as number,
    comissaoRevertida: v.comissao_revertida as number,
  };
}

export default async function Painel({ searchParams }: PageProps<"/painel">) {
  const { mes: mesParam } = await searchParams;
  const { supabase, revendedor, papel } = await exigirRevendedor();
  if (papel !== "dono") return <PainelEquipe nome={revendedor.nome} />;

  const hoje = hojeISO();
  const mesAtual = mesISO();
  const mes = typeof mesParam === "string" && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : mesAtual;
  const anterior = somarMesISO(mes, -1);
  const { inicio, fim } = limitesDoMes(mes);
  const inicioAnterior = limitesDoMes(anterior).inicio;
  const em7dias = new Date(Date.parse(hoje) + 7 * 86_400_000).toISOString().slice(0, 10);

  const [vendas, itens, pendentes, giro, produtos, pedidos, catalogos, regras, ajustes] = await Promise.all([
    supabase
      .from("venda")
      .select("data, status, pecas, total_liquido, custo_total, comissao_total, devolvido_pecas, devolvido_receita, devolvido_custo, comissao_revertida")
      .eq("revendedor_id", revendedor.id)
      .gte("data", inicioAnterior)
      .lte("data", fim),
    supabase
      .from("venda_item")
      .select("produto_id, codigo, imagem_path, quantidade, quantidade_devolvida, subtotal, desconto_rateado, venda!inner (data, status)")
      .eq("revendedor_id", revendedor.id)
      .gte("venda.data", inicio)
      .lte("venda.data", fim)
      .neq("venda.status", "cancelada"),
    supabase.from("recebimento").select("valor, vencimento, venda:venda_id (cliente:cliente_id (id, nome, telefone))").eq("revendedor_id", revendedor.id).eq("status", "pendente"),
    supabase.from("estoque_giro").select("produto_id, saldo, ultima_venda, ultima_entrada").eq("revendedor_id", revendedor.id).gt("saldo", 0),
    supabase.from("produto").select("id, codigo, custo, preco_manual, imagem_path").eq("revendedor_id", revendedor.id),
    supabase.from("pedido").select("id", { count: "exact", head: true }).eq("revendedor_id", revendedor.id).in("status", ["enviado", "confirmado"]),
    supabase.from("catalogo").select("id", { count: "exact", head: true }).eq("revendedor_id", revendedor.id),
    carregarRegras(supabase, revendedor.id),
    carregarAjustes(supabase, revendedor.id),
  ]);
  for (const r of [vendas, itens, pendentes, giro, produtos]) if (r.error) throw new Error(r.error.message);

  const todas = (vendas.data ?? []).map(paraVenda);
  const doMes = resumirVendas(todas.filter((v) => v.data >= inicio));
  const doAnterior = resumirVendas(todas.filter((v) => v.data < inicio));
  const dias = faturamentoPorDia(todas, mes);

  const top = maisVendidos(
    (itens.data ?? []).map((i) => ({
      produtoId: i.produto_id,
      codigo: i.codigo,
      imagemPath: i.imagem_path,
      quantidade: i.quantidade,
      quantidadeDevolvida: i.quantidade_devolvida,
      receita: i.subtotal - i.desconto_rateado,
    }))
  );

  const listaProdutos = produtos.data ?? [];
  const porProduto = new Map(listaProdutos.map((p) => [p.id, p]));
  const giroCompleto = (giro.data ?? []).flatMap((g) => {
    const p = porProduto.get(g.produto_id);
    if (!p) return [];
    const preco = precificar(p, regras, ajustes.get(p.id));
    return [
      {
        produtoId: p.id,
        codigo: p.codigo,
        saldo: g.saldo as number,
        custoUnitario: preco.custoUnitario,
        precoVenda: preco.precoVenda,
        ultimaVenda: g.ultima_venda as string | null,
        ultimaEntrada: g.ultima_entrada as string | null,
        imagemPath: p.imagem_path as string | null,
      },
    ];
  });
  const estoquePecas = giroCompleto.reduce((s, g) => s + g.saldo, 0);
  const estoqueCusto = giroCompleto.reduce((s, g) => s + g.saldo * g.custoUnitario, 0);
  const estoqueVenda = giroCompleto.reduce((s, g) => s + g.saldo * g.precoVenda, 0);
  const paradas = pecasParadas(giroCompleto, hoje, DIAS_PARADO);
  const valorParado = paradas.reduce((s, p) => s + p.valorParado, 0);

  type Pendente = { valor: number; vencimento: string; venda: { cliente: { id: string; nome: string; telefone: string | null } | null } | null };
  const abertas = (pendentes.data ?? []) as unknown as Pendente[];
  const aReceber = abertas.reduce((s, p) => s + p.valor, 0);
  const atrasado = abertas.filter((p) => p.vencimento < hoje).reduce((s, p) => s + p.valor, 0);
  const semana = abertas.filter((p) => p.vencimento >= hoje && p.vencimento <= em7dias).reduce((s, p) => s + p.valor, 0);
  const devedores = new Map<string, { id: string; nome: string; telefone: string | null; atrasado: number; total: number }>();
  for (const p of abertas) {
    const c = p.venda?.cliente;
    if (!c) continue;
    const d = devedores.get(c.id) ?? { ...c, atrasado: 0, total: 0 };
    d.total += p.valor;
    if (p.vencimento < hoje) d.atrasado += p.valor;
    devedores.set(c.id, d);
  }
  const quemDeve = [...devedores.values()].filter((d) => d.atrasado > 0).sort((a, b) => b.atrasado - a.atrasado).slice(0, 5);

  const urls = await urlsAssinadas(supabase, [...top.map((t) => t.imagemPath), ...paradas.slice(0, 6).map((p) => p.imagemPath)]);
  const semNada = (catalogos.count ?? 0) === 0 && listaProdutos.length === 0;

  return (
    <>
      <Titulo
        acao={
          <Link href="/vendas/nova" className="rounded-lg bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escura">
            Nova venda
          </Link>
        }
      >
        Olá, {revendedor.nome}
      </Titulo>

      {semNada && (
        <Cartao className="mb-6">
          <h2 className="font-semibold">Comece pelo catálogo do representante</h2>
          <p className="mt-1 text-sm text-zinc-500">Envie o PDF e o sistema separa cada relógio com foto, código e preço. Depois é só montar o pedido.</p>
          <Link href="/catalogos/novo" className="mt-4 inline-block rounded-lg bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escura">
            Subir catálogo
          </Link>
        </Cartao>
      )}

      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link href={`/painel?mes=${anterior}`} className="rounded-lg border border-zinc-300 bg-white px-3 py-1 hover:bg-zinc-50" aria-label="Mês anterior">
          ←
        </Link>
        <span className="min-w-36 text-center font-medium">{nomeDoMes(mes)}</span>
        {mes < mesAtual ? (
          <Link href={`/painel?mes=${somarMesISO(mes, 1)}`} className="rounded-lg border border-zinc-300 bg-white px-3 py-1 hover:bg-zinc-50" aria-label="Próximo mês">
            →
          </Link>
        ) : (
          <span className="rounded-lg border border-zinc-200 px-3 py-1 text-zinc-300">→</span>
        )}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Faturamento" valor={formatarReais(doMes.faturamento)} variacao={variacaoBp(doMes.faturamento, doAnterior.faturamento)} />
        <Indicador
          rotulo="Lucro"
          valor={formatarReais(doMes.lucro)}
          cor={doMes.lucro < 0 ? "text-red-700" : "text-emerald-700"}
          variacao={variacaoBp(doMes.lucro, doAnterior.lucro)}
          detalhe={doMes.faturamento > 0 ? `margem de ${(doMes.margemBp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : undefined}
        />
        <Indicador rotulo="Vendas" valor={doMes.vendas.toLocaleString("pt-BR")} detalhe={`${doMes.pecas.toLocaleString("pt-BR")} peça(s)`} variacao={variacaoBp(doMes.vendas, doAnterior.vendas)} />
        <Indicador rotulo="Ticket médio" valor={formatarReais(doMes.ticketMedio)} variacao={variacaoBp(doMes.ticketMedio, doAnterior.ticketMedio)} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Cartao className="lg:col-span-2">
          <h2 className="mb-4 font-semibold">Faturamento por dia</h2>
          <GraficoDias dias={dias} mes={mes} hoje={hoje} />
        </Cartao>
        <Cartao>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-semibold">A receber</h2>
            <Link href="/vendas/receber" className="text-sm text-zinc-500 hover:text-zinc-900">
              ver tudo
            </Link>
          </div>
          <dl className="space-y-1 text-sm">
            <Linha rotulo="Total em aberto" valor={formatarReais(aReceber)} />
            <Linha rotulo="Atrasado" valor={formatarReais(atrasado)} cor={atrasado > 0 ? "text-red-700 font-medium" : ""} />
            <Linha rotulo="Vence nos próximos 7 dias" valor={formatarReais(semana)} />
          </dl>
          {quemDeve.length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-sm font-medium text-zinc-500">Quem está devendo</h3>
              <ul className="space-y-1.5 text-sm">
                {quemDeve.map((d) => {
                  const whatsapp = linkWhatsapp(d.telefone);
                  return (
                    <li key={d.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        <Link href={`/clientes/${d.id}`} className="hover:underline">
                          {d.nome}
                        </Link>
                        {whatsapp && (
                          <a href={whatsapp} target="_blank" rel="noreferrer" className="ml-2 text-xs text-emerald-700 hover:underline">
                            WhatsApp
                          </a>
                        )}
                      </span>
                      <span className="tabular-nums text-red-700">{formatarReais(d.atrasado)}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Cartao>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Cartao>
          <h2 className="mb-3 font-semibold">Mais vendidos no mês</h2>
          {top.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma venda neste mês.</p>
          ) : (
            <ol className="space-y-2">
              {top.map((t, i) => (
                <li key={t.codigo} className="flex items-center gap-3 text-sm">
                  <span className="w-4 text-zinc-400">{i + 1}</span>
                  <Foto url={t.imagemPath ? urls.get(t.imagemPath) : undefined} />
                  <span className="flex-1">
                    {t.produtoId ? (
                      <Link href={`/estoque/${t.produtoId}`} className="font-mono hover:underline">
                        {t.codigo}
                      </Link>
                    ) : (
                      <span className="font-mono">{t.codigo}</span>
                    )}
                    <span className="block text-xs text-zinc-500">{formatarReais(t.receita)}</span>
                  </span>
                  <span className="tabular-nums font-medium">{t.pecas} un.</span>
                </li>
              ))}
            </ol>
          )}
        </Cartao>

        <Cartao>
          <h2 className="font-semibold">Peças paradas</h2>
          <p className="mb-3 text-xs text-zinc-500">
            Sem venda há {DIAS_PARADO} dias ou mais{paradas.length > 0 ? ` · ${formatarReais(valorParado)} em custo parado` : ""}
          </p>
          {paradas.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma. Todo o estoque girou nos últimos {DIAS_PARADO} dias.</p>
          ) : (
            <ul className="space-y-2">
              {paradas.slice(0, 6).map((p) => (
                <li key={p.produtoId} className="flex items-center gap-3 text-sm">
                  <Foto url={p.imagemPath ? urls.get(p.imagemPath) : undefined} />
                  <span className="flex-1">
                    <Link href={`/estoque/${p.produtoId}`} className="font-mono hover:underline">
                      {p.codigo}
                    </Link>
                    <span className="block text-xs text-zinc-500">
                      {p.saldo} un. · {p.ultimaVenda ? `última venda em ${formatarData(p.ultimaVenda)}` : "nunca vendeu"}
                    </span>
                  </span>
                  <span className="tabular-nums text-zinc-600">{p.diasParado ?? "—"} dias</span>
                </li>
              ))}
              {paradas.length > 6 && <li className="text-xs text-zinc-500">e mais {paradas.length - 6}</li>}
            </ul>
          )}
        </Cartao>

        <Cartao>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-semibold">Estoque</h2>
            <Link href="/estoque" className="text-sm text-zinc-500 hover:text-zinc-900">
              ver tudo
            </Link>
          </div>
          <dl className="space-y-1 text-sm">
            <Linha rotulo="Peças" valor={estoquePecas.toLocaleString("pt-BR")} />
            <Linha rotulo="Valor de custo" valor={formatarReais(estoqueCusto)} />
            <Linha rotulo="Valor de venda" valor={formatarReais(estoqueVenda)} />
            <Linha rotulo="Lucro se vender tudo" valor={formatarReais(estoqueVenda - estoqueCusto)} cor="text-emerald-700" />
          </dl>
          {(pedidos.count ?? 0) > 0 && (
            <Link href="/pedidos" className="mt-4 block rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100">
              {pedidos.count} pedido(s) a caminho
            </Link>
          )}
        </Cartao>
      </div>
    </>
  );
}

async function PainelEquipe({ nome }: { nome: string }) {
  return (
    <>
      <Titulo>{nome}</Titulo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/estoque">
          <Cartao className="hover:border-zinc-400">
            <h2 className="font-semibold">Estoque</h2>
            <p className="mt-1 text-sm text-zinc-500">Consulte as peças disponíveis e os preços.</p>
          </Cartao>
        </Link>
        <Link href="/clientes">
          <Cartao className="hover:border-zinc-400">
            <h2 className="font-semibold">Clientes</h2>
            <p className="mt-1 text-sm text-zinc-500">Cadastre e consulte clientes.</p>
          </Cartao>
        </Link>
      </div>
    </>
  );
}

function Indicador({ rotulo, valor, cor = "", detalhe, variacao }: { rotulo: string; valor: string; cor?: string; detalhe?: string; variacao?: number | null }) {
  return (
    <Cartao>
      <p className="text-sm text-zinc-500">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${cor}`}>{valor}</p>
      <p className="mt-0.5 text-xs text-zinc-500">
        {variacao != null && (
          <span className={variacao >= 0 ? "text-emerald-700" : "text-red-700"}>
            {variacao >= 0 ? "▲" : "▼"} {Math.abs(variacao / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% vs mês anterior
          </span>
        )}
        {variacao != null && detalhe && " · "}
        {detalhe}
      </p>
    </Cartao>
  );
}

function Linha({ rotulo, valor, cor = "" }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className={`flex justify-between ${cor}`}>
      <dt>{rotulo}</dt>
      <dd className="tabular-nums">{valor}</dd>
    </div>
  );
}

function Foto({ url }: { url?: string }) {
  return (
    <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-zinc-100">
      {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage */}
      {url && <img src={url} alt="" className="h-full w-full object-contain" />}
    </div>
  );
}
