import Link from "next/link";
import { notFound } from "next/navigation";
import { calcularPeca, formatarReais, resumir } from "@revenda/regras";
import { Botao, Cartao, Titulo, classeCampo } from "@/componentes/ui";
import { carregarRegras } from "@/lib/regras";
import { exigirDono } from "@/lib/sessao";
import { excluirCatalogo } from "./acoes";
import { criarPedidoDoCatalogo } from "../../pedidos/acoes";

export default async function Catalogo({ params, searchParams }: PageProps<"/catalogos/[id]">) {
  const { id } = await params;
  const { q } = await searchParams;
  const busca = typeof q === "string" ? q.trim().toUpperCase() : "";
  const { supabase, revendedor } = await exigirDono();

  const { data: catalogo } = await supabase.from("catalogo").select("id, nome, status, total_pecas, total_paginas").eq("id", id).maybeSingle();
  if (!catalogo) notFound();

  let consulta = supabase
    .from("catalogo_peca")
    .select("id, pagina, posicao, codigo, custo, imagem_path, origem_leitura")
    .eq("catalogo_id", id)
    .order("pagina")
    .order("posicao");
  if (busca) consulta = consulta.ilike("codigo", `%${busca.replace(/[%_]/g, "")}%`);
  const [{ data: pecas, error }, regras] = await Promise.all([consulta, carregarRegras(supabase, revendedor.id)]);
  if (error) throw new Error(error.message);

  const caminhos = pecas.map((p) => p.imagem_path).filter((p): p is string => Boolean(p));
  const urls = new Map<string, string>();
  for (let i = 0; i < caminhos.length; i += 500) {
    const { data } = await supabase.storage.from("catalogos").createSignedUrls(caminhos.slice(i, i + 500), 3600);
    for (const u of data ?? []) if (u.path && u.signedUrl) urls.set(u.path, u.signedUrl);
  }

  const comissoesPadrao = regras.comissoes.filter((c) => c.ligadaPorPadrao);
  const linhas = pecas.map((p) => ({ ...p, calc: calcularPeca({ custo: p.custo, regra: regras.regra, custos: regras.custos, comissoes: comissoesPadrao }) }));
  const total = resumir(linhas.map((l) => l.calc));

  return (
    <>
      <Titulo
        acao={
          <div className="flex gap-2">
            <form action={criarPedidoDoCatalogo}>
              <input type="hidden" name="catalogo_id" value={catalogo.id} />
              <Botao type="submit">Montar pedido</Botao>
            </form>
            <form action={excluirCatalogo}>
              <input type="hidden" name="id" value={catalogo.id} />
              <Botao variante="perigo" type="submit">
                Excluir catálogo
              </Botao>
            </form>
          </div>
        }
      >
        {catalogo.nome}
      </Titulo>
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Indicador rotulo="Peças" valor={catalogo.total_pecas.toLocaleString("pt-BR")} />
        <Indicador rotulo="Custo médio" valor={formatarReais(total.pecas ? Math.round(total.custoPeca / total.pecas) : 0)} />
        <Indicador rotulo="Venda média" valor={formatarReais(total.pecas ? Math.round(total.venda / total.pecas) : 0)} />
        <Indicador rotulo="Margem média" valor={`${(total.margemBp / 100).toFixed(1)}%`} />
      </div>
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={busca} placeholder="Buscar código" className={`${classeCampo} max-w-xs`} />
        <Botao variante="secundario" type="submit">
          Buscar
        </Botao>
        {busca && (
          <Link href={`/catalogos/${id}`} className="self-center text-sm text-zinc-500 hover:underline">
            limpar
          </Link>
        )}
      </form>
      <p className="mb-3 text-sm text-zinc-500">
        Preço de venda e lucro pelas suas <Link href="/configuracoes" className="underline">regras</Link>. Para pedir, toque em &quot;Montar pedido&quot;.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {linhas.map((p) => {
          const url = p.imagem_path ? urls.get(p.imagem_path) : undefined;
          return (
            <div key={p.id} className="rounded-xl border border-zinc-200 bg-white p-2">
              <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-zinc-100">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage
                  <img src={url} alt={p.codigo} loading="lazy" className="h-full w-full object-contain" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">sem foto</span>
                )}
              </div>
              <p className="mt-2 px-1 font-mono text-sm">{p.codigo}</p>
              <dl className="space-y-0.5 px-1 text-xs">
                <div className="flex justify-between text-zinc-500">
                  <dt>Custo</dt>
                  <dd>{formatarReais(p.calc.custoTotal)}</dd>
                </div>
                <div className="flex justify-between font-medium">
                  <dt>Venda</dt>
                  <dd>{formatarReais(p.calc.precoVenda)}</dd>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <dt>Lucro</dt>
                  <dd>{formatarReais(p.calc.lucro)}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
      {linhas.length === 0 && (
        <Cartao>
          <p className="text-sm text-zinc-500">Nenhuma peça encontrada.</p>
        </Cartao>
      )}
    </>
  );
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Cartao>
      <p className="text-sm text-zinc-500">{rotulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
    </Cartao>
  );
}
