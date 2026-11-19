"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatarReais, resumir, calcularPeca, type RegrasCalculo } from "@revenda/regras";
import { definirQuantidade, mudarStatus } from "@/app/(app)/pedidos/acoes";
import { Aviso, Botao, classeCampo } from "@/componentes/ui";

export interface PecaDoCatalogo {
  id: string;
  codigo: string;
  custo: number;
  pagina: number;
  url: string | null;
}

interface Props {
  pedidoId: string;
  pecas: PecaDoCatalogo[];
  quantidadesIniciais: Record<string, number>;
  regras: RegrasCalculo;
}

const ESPERA_MS = 400;

export default function MontarPedido({ pedidoId, pecas, quantidadesIniciais, regras }: Props) {
  const router = useRouter();
  const [quantidades, setQuantidades] = useState<Record<string, number>>(quantidadesIniciais);
  const [filtro, setFiltro] = useState<"todas" | "selecionadas">("todas");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(0);
  const [enviando, iniciarEnvio] = useTransition();
  const pendentes = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const gravacoes = useRef(new Set<Promise<unknown>>());

  const gravar = useCallback(
    (pecaId: string, quantidade: number) => {
      const p = definirQuantidade(pedidoId, pecaId, quantidade).then((r) => {
        if (r.erro) setErro(r.erro);
      });
      gravacoes.current.add(p);
      setSalvando((n) => n + 1);
      p.finally(() => {
        gravacoes.current.delete(p);
        setSalvando((n) => n - 1);
      });
    },
    [pedidoId]
  );

  const mudar = useCallback(
    (pecaId: string, quantidade: number) => {
      const q = Math.max(0, Math.min(999, Math.round(quantidade) || 0));
      setQuantidades((atual) => ({ ...atual, [pecaId]: q }));
      const anterior = pendentes.current.get(pecaId);
      if (anterior) clearTimeout(anterior);
      pendentes.current.set(
        pecaId,
        setTimeout(() => {
          pendentes.current.delete(pecaId);
          gravar(pecaId, q);
        }, ESPERA_MS)
      );
    },
    [gravar]
  );

  // Salva o que estiver pendente antes de sair da página.
  useEffect(() => {
    const aoSair = (e: BeforeUnloadEvent) => {
      if (pendentes.current.size > 0 || gravacoes.current.size > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, []);

  async function descarregar() {
    for (const [pecaId, t] of pendentes.current) {
      clearTimeout(t);
      gravar(pecaId, quantidades[pecaId] ?? 0);
    }
    pendentes.current.clear();
    await Promise.all([...gravacoes.current]);
  }

  const calculos = useMemo(() => {
    const m = new Map<string, ReturnType<typeof calcularPeca>>();
    for (const p of pecas) m.set(p.id, calcularPeca({ custo: p.custo, regra: regras.regra, custos: regras.custos, comissoes: regras.comissoes }));
    return m;
  }, [pecas, regras]);

  const total = useMemo(
    () =>
      resumir(
        pecas
          .filter((p) => (quantidades[p.id] ?? 0) > 0)
          .map((p) => calcularPeca({ custo: p.custo, quantidade: quantidades[p.id], regra: regras.regra, custos: regras.custos, comissoes: regras.comissoes }))
      ),
    [pecas, quantidades, regras]
  );

  const termo = busca.trim().toUpperCase();
  const visiveis = pecas.filter((p) => (filtro === "todas" || (quantidades[p.id] ?? 0) > 0) && (!termo || p.codigo.includes(termo)));

  function enviar() {
    setErro(null);
    iniciarEnvio(async () => {
      await descarregar();
      const r = await mudarStatus(pedidoId, "enviado");
      if (r.erro) setErro(r.erro);
      else router.refresh();
    });
  }

  return (
    <div className="pb-28">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-zinc-100 p-1 text-sm">
          {(["todas", "selecionadas"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`rounded-md px-3 py-1 ${filtro === f ? "bg-white font-medium shadow-sm" : "text-zinc-500"}`}
            >
              {f === "todas" ? `Todas (${pecas.length})` : `No pedido (${Object.values(quantidades).filter((q) => q > 0).length})`}
            </button>
          ))}
        </div>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar código" className={`${classeCampo} max-w-48`} />
        <span className="text-xs text-zinc-400">{salvando > 0 ? "salvando…" : "salvo"}</span>
      </div>
      {erro && (
        <div className="mb-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {visiveis.map((p) => {
          const q = quantidades[p.id] ?? 0;
          const c = calculos.get(p.id)!;
          return (
            <div key={p.id} className={`rounded-xl border bg-white p-2 transition ${q > 0 ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200"}`}>
              <button type="button" onClick={() => mudar(p.id, q > 0 ? q : 1)} className="relative block aspect-[3/4] w-full overflow-hidden rounded-lg bg-zinc-100">
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage
                  <img src={p.url} alt={p.codigo} loading="lazy" className="h-full w-full object-contain" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">sem foto</span>
                )}
                {q > 0 && <span className="absolute right-1.5 top-1.5 rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white">{q}</span>}
              </button>
              <div className="mt-2 flex items-start justify-between gap-1 px-1">
                <div>
                  <p className="font-mono text-sm">{p.codigo}</p>
                  <p className="text-xs text-zinc-500">
                    {formatarReais(p.custo)} → <span className="text-zinc-900">{formatarReais(c.precoVenda)}</span>
                  </p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-lg border border-zinc-200">
                <button type="button" aria-label={`Menos ${p.codigo}`} onClick={() => mudar(p.id, q - 1)} disabled={q === 0} className="px-3 py-1.5 text-lg leading-none disabled:text-zinc-300">
                  −
                </button>
                <input
                  aria-label={`Quantidade de ${p.codigo}`}
                  inputMode="numeric"
                  value={q}
                  onChange={(e) => mudar(p.id, Number(e.target.value.replace(/\D/g, "")))}
                  className="w-10 text-center text-sm tabular-nums outline-none"
                />
                <button type="button" aria-label={`Mais ${p.codigo}`} onClick={() => mudar(p.id, q + 1)} className="px-3 py-1.5 text-lg leading-none">
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <Total rotulo="Peças" valor={total.pecas.toLocaleString("pt-BR")} />
            <Total rotulo="Custo do pedido" valor={formatarReais(total.custoPeca)} />
            <Total rotulo="Venda prevista" valor={formatarReais(total.venda)} />
            <Total rotulo="Lucro previsto" valor={formatarReais(total.lucro)} destaque />
          </dl>
          <Botao type="button" onClick={enviar} disabled={enviando || total.pecas === 0}>
            {enviando ? "Fechando…" : "Fechar pedido"}
          </Botao>
        </div>
      </div>
    </div>
  );
}

function Total({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{rotulo}</dt>
      <dd className={`font-semibold tabular-nums ${destaque ? "text-emerald-700" : ""}`}>{valor}</dd>
    </div>
  );
}
