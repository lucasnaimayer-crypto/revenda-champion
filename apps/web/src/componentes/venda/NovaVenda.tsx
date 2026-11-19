"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calcularVenda, FORMAS_PAGAMENTO, formatarReais, lerReais, parcelar, bpParaPercentual } from "@revenda/regras";
import { registrarVenda } from "@/app/(app)/vendas/acoes";
import { Aviso, Botao, classeCampo } from "@/componentes/ui";

export interface ProdutoVenda {
  id: string;
  codigo: string;
  descricao: string | null;
  url: string | null;
  saldo: number;
  preco: number;
  custo: number;
}

interface Props {
  produtos: ProdutoVenda[];
  clientes: { id: string; nome: string }[];
  comissoes: { id: string; nome: string; percentualBp: number; ligadaPorPadrao: boolean }[];
  hoje: string;
  clienteInicial?: string | null;
}

function somarMes(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

export default function NovaVenda({ produtos, clientes, comissoes, hoje, clienteInicial }: Props) {
  const router = useRouter();
  const [chave] = useState(() => crypto.randomUUID());
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [busca, setBusca] = useState("");
  const [data, setData] = useState(hoje);
  const [clienteId, setClienteId] = useState<string>(clienteInicial ?? "");
  const [clienteNovo, setClienteNovo] = useState("");
  const [forma, setForma] = useState<string>("pix");
  const [descontoTexto, setDescontoTexto] = useState("");
  const [escolhidas, setEscolhidas] = useState<string[]>(() => comissoes.filter((c) => c.ligadaPorPadrao).map((c) => c.id));
  const [aVista, setAVista] = useState(true);
  const [entradaTexto, setEntradaTexto] = useState("");
  const [parcelas, setParcelas] = useState(1);
  const [primeiroVencimento, setPrimeiroVencimento] = useState(() => somarMes(hoje));
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const termo = busca.trim().toUpperCase();
  const visiveis = produtos.filter((p) => !termo || p.codigo.includes(termo) || (p.descricao ?? "").toUpperCase().includes(termo));
  const itens = Object.entries(carrinho).filter(([, q]) => q > 0);
  const desconto = descontoTexto.trim() ? lerReais(descontoTexto) : 0;
  const entrada = entradaTexto.trim() ? lerReais(entradaTexto) : 0;

  const previa = useMemo(() => {
    if (itens.length === 0) return { calculo: null, parcelas: [], problema: null as string | null };
    try {
      if (desconto === null) throw new Error("Desconto inválido.");
      const calculo = calcularVenda({
        linhas: itens.map(([id, q]) => {
          const p = porId.get(id)!;
          return { produtoId: id, quantidade: q, precoUnitario: p.preco, custoUnitario: p.custo };
        }),
        desconto,
        comissoes: comissoes.filter((c) => escolhidas.includes(c.id)),
      });
      if (aVista) return { calculo, parcelas: [{ valor: calculo.totalLiquido, vencimento: data, recebido: true }], problema: null };
      if (entrada === null) return { calculo, parcelas: [], problema: "Entrada inválida." };
      try {
        return { calculo, parcelas: parcelar({ total: calculo.totalLiquido, dataVenda: data, entrada, parcelas, primeiroVencimento }), problema: null };
      } catch (e) {
        return { calculo, parcelas: [], problema: e instanceof Error ? e.message : String(e) };
      }
    } catch (e) {
      return { calculo: null, parcelas: [], problema: e instanceof Error ? e.message : String(e) };
    }
  }, [itens, porId, desconto, comissoes, escolhidas, aVista, entrada, parcelas, primeiroVencimento, data]);

  function mudar(id: string, quantidade: number) {
    const p = porId.get(id);
    if (!p) return;
    const q = Math.max(0, Math.min(p.saldo, quantidade));
    setCarrinho((c) => {
      const novo = { ...c };
      if (q === 0) delete novo[id];
      else novo[id] = q;
      return novo;
    });
  }

  function enviar() {
    setErro(null);
    if (!previa.calculo || previa.problema) {
      setErro(previa.problema ?? "Adicione ao menos uma peça.");
      return;
    }
    iniciar(async () => {
      try {
        const r = await registrarVenda({
          chave,
          data,
          clienteId: clienteId && clienteId !== "novo" ? clienteId : null,
          clienteNovo: clienteId === "novo" && clienteNovo.trim() ? clienteNovo.trim() : null,
          formaPagamento: forma,
          itens: itens.map(([produtoId, quantidade]) => ({ produtoId, quantidade })),
          desconto: desconto ?? 0,
          comissoes: escolhidas,
          aVista,
          entrada: entrada ?? 0,
          parcelas: aVista ? 0 : parcelas,
          primeiroVencimento: aVista ? null : primeiroVencimento,
          observacao: observacao.trim() || null,
        });
        if (r.erro) setErro(r.erro);
        else if (r.id) router.push(`/vendas/${r.id}`);
      } catch {
        setErro("Não foi possível falar com o servidor. Confira a internet e tente de novo; a venda não será duplicada.");
      }
    });
  }

  const c = previa.calculo;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar código ou descrição" className={`${classeCampo} mb-3`} />
        {produtos.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">Nenhuma peça em estoque. As peças entram quando você recebe um pedido ou ajusta o estoque.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visiveis.map((p) => {
              const q = carrinho[p.id] ?? 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => mudar(p.id, q + 1)}
                  disabled={q >= p.saldo}
                  className={`rounded-xl border bg-white p-2 text-left transition disabled:opacity-60 ${q > 0 ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-400"}`}
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-zinc-100">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage */}
                    {p.url ? <img src={p.url} alt={p.codigo} loading="lazy" className="h-full w-full object-contain" /> : <span className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">sem foto</span>}
                    {q > 0 && <span className="absolute right-1.5 top-1.5 rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white">{q}</span>}
                  </div>
                  <p className="mt-2 px-1 font-mono text-sm">{p.codigo}</p>
                  <p className="flex justify-between px-1 text-xs text-zinc-500">
                    <span className="font-medium text-zinc-900">{formatarReais(p.preco)}</span>
                    <span>{p.saldo} em estoque</span>
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">Peças da venda</h2>
          {itens.length === 0 ? (
            <p className="text-sm text-zinc-500">Toque nas fotos para adicionar.</p>
          ) : (
            <ul className="space-y-2">
              {itens.map(([id, q]) => {
                const p = porId.get(id)!;
                return (
                  <li key={id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-mono">{p.codigo}</span>
                    <span className="flex items-center rounded-lg border border-zinc-200">
                      <button type="button" aria-label={`Menos ${p.codigo}`} onClick={() => mudar(id, q - 1)} className="px-2.5 py-1">
                        −
                      </button>
                      <span className="w-6 text-center tabular-nums">{q}</span>
                      <button type="button" aria-label={`Mais ${p.codigo}`} onClick={() => mudar(id, q + 1)} disabled={q >= p.saldo} className="px-2.5 py-1 disabled:text-zinc-300">
                        +
                      </button>
                    </span>
                    <span className="w-24 text-right tabular-nums">{formatarReais(p.preco * q)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Data</span>
              <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} className={classeCampo} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Desconto (R$)</span>
              <input value={descontoTexto} onChange={(e) => setDescontoTexto(e.target.value)} inputMode="decimal" placeholder="0,00" className={classeCampo} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Cliente</span>
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={classeCampo}>
              <option value="">Sem cliente</option>
              <option value="novo">+ Cadastrar agora</option>
              {clientes.map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.nome}
                </option>
              ))}
            </select>
          </label>
          {clienteId === "novo" && <input value={clienteNovo} onChange={(e) => setClienteNovo(e.target.value)} placeholder="Nome do cliente" className={classeCampo} />}
          {comissoes.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Comissões desta venda</legend>
              {comissoes.map((cm) => (
                <label key={cm.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={escolhidas.includes(cm.id)}
                    onChange={(e) => setEscolhidas((l) => (e.target.checked ? [...l, cm.id] : l.filter((x) => x !== cm.id)))}
                  />
                  {cm.nome} ({bpParaPercentual(cm.percentualBp).toLocaleString("pt-BR")}%)
                </label>
              ))}
            </fieldset>
          )}
          <label className="block space-y-1">
            <span className="text-sm font-medium">Forma de pagamento</span>
            <select value={forma} onChange={(e) => setForma(e.target.value)} className={classeCampo}>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </label>
          <div className="flex rounded-lg bg-zinc-100 p-1 text-sm">
            {[
              { v: true, r: "Recebido agora" },
              { v: false, r: "A prazo / parcelado" },
            ].map((o) => (
              <button key={o.r} type="button" onClick={() => setAVista(o.v)} className={`flex-1 rounded-md px-3 py-1 ${aVista === o.v ? "bg-white font-medium shadow-sm" : "text-zinc-500"}`}>
                {o.r}
              </button>
            ))}
          </div>
          {!aVista && (
            <div className="grid grid-cols-3 gap-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium">Entrada (R$)</span>
                <input value={entradaTexto} onChange={(e) => setEntradaTexto(e.target.value)} inputMode="decimal" placeholder="0,00" className={classeCampo} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium">Parcelas</span>
                <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} className={classeCampo}>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}x
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium">1º vencimento</span>
                <input type="date" value={primeiroVencimento} min={data} onChange={(e) => setPrimeiroVencimento(e.target.value)} className={classeCampo} />
              </label>
            </div>
          )}
          <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} rows={2} placeholder="Observação (opcional)" className={classeCampo} />
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <dl className="space-y-1">
            <Linha rotulo="Total das peças" valor={formatarReais(c?.totalBruto ?? 0)} />
            {(c?.desconto ?? 0) > 0 && <Linha rotulo="Desconto" valor={`− ${formatarReais(c!.desconto)}`} />}
            <Linha rotulo="Total da venda" valor={formatarReais(c?.totalLiquido ?? 0)} forte />
            <Linha rotulo="Custo das peças" valor={formatarReais(c?.custoTotal ?? 0)} fraco />
            {c?.comissoes.map((cm) => <Linha key={cm.nome} rotulo={`Comissão ${cm.nome}`} valor={formatarReais(cm.valor)} fraco />)}
            <Linha rotulo={`Lucro${c && c.totalLiquido > 0 ? ` (${(c.margemBp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)` : ""}`} valor={formatarReais(c?.lucro ?? 0)} destaque={(c?.lucro ?? 0) >= 0 ? "ok" : "ruim"} />
          </dl>
          {!aVista && previa.parcelas.length > 0 && (
            <ul className="mt-3 space-y-0.5 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
              {previa.parcelas.map((p, i) => (
                <li key={i} className="flex justify-between">
                  <span>{p.recebido ? "Entrada (hoje)" : `Parcela ${i + (previa.parcelas[0].recebido ? 0 : 1)} · ${p.vencimento.split("-").reverse().join("/")}`}</span>
                  <span className="tabular-nums">{formatarReais(p.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(erro || (itens.length > 0 && previa.problema)) && <Aviso>{erro ?? previa.problema}</Aviso>}
        <Botao type="button" onClick={enviar} disabled={enviando || itens.length === 0 || Boolean(previa.problema)} className="w-full">
          {enviando ? "Registrando…" : "Registrar venda"}
        </Botao>
      </aside>
    </div>
  );
}

function Linha({ rotulo, valor, forte, fraco, destaque }: { rotulo: string; valor: string; forte?: boolean; fraco?: boolean; destaque?: "ok" | "ruim" }) {
  const cor = destaque === "ok" ? "text-emerald-700 font-semibold" : destaque === "ruim" ? "text-red-700 font-semibold" : forte ? "font-semibold" : fraco ? "text-zinc-500" : "";
  return (
    <div className={`flex justify-between ${cor}`}>
      <dt>{rotulo}</dt>
      <dd className="tabular-nums">{valor}</dd>
    </div>
  );
}
