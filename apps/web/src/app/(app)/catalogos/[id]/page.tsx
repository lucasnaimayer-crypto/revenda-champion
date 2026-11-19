import Link from "next/link";
import { notFound } from "next/navigation";
import EscolherPedido from "@/componentes/pedido/EscolherPedido";
import MontarPedido, { type OutrosItens } from "@/componentes/pedido/MontarPedido";
import { urlsAssinadas } from "@/lib/arquivos";
import { carregarRascunhos, escolherRascunho } from "@/lib/rascunhos";
import { carregarRegras, paraCalculo } from "@/lib/regras";
import { exigirDono } from "@/lib/sessao";
import { excluirCatalogo } from "./acoes";

// O catálogo é a vitrine para montar o pedido: todas as peças começam fora e o revendedor toca
// nas que quer. As peças vão para um rascunho que pode juntar vários catálogos (e, no futuro,
// o catálogo único da Champion, que é só mais um catálogo com origem "champion").
export default async function Catalogo({ params, searchParams }: PageProps<"/catalogos/[id]">) {
  const { id } = await params;
  const { pedido: escolhido } = await searchParams;
  const { supabase, revendedor } = await exigirDono();

  const { data: catalogo } = await supabase.from("catalogo").select("id, nome, total_pecas").eq("id", id).maybeSingle();
  if (!catalogo) notFound();

  const [{ data: pecas, error }, regras, rascunhos] = await Promise.all([
    supabase.from("catalogo_peca").select("id, pagina, posicao, codigo, custo, imagem_path").eq("catalogo_id", id).order("pagina").order("posicao"),
    carregarRegras(supabase, revendedor.id),
    carregarRascunhos(supabase, revendedor.id),
  ]);
  if (error) throw new Error(error.message);
  const rascunho = escolherRascunho(rascunhos, escolhido);

  const quantidades: Record<string, number> = {};
  const outros: OutrosItens = { pecas: 0, custoPeca: 0, venda: 0, lucro: 0 };
  if (rascunho) {
    const daqui = new Set(pecas.map((p) => p.id));
    const { data: itens } = await supabase.from("pedido_item").select("catalogo_peca_id, quantidade, custo, preco_venda, lucro").eq("pedido_id", rascunho.id);
    for (const i of itens ?? []) {
      if (i.catalogo_peca_id && daqui.has(i.catalogo_peca_id)) {
        quantidades[i.catalogo_peca_id] = i.quantidade;
      } else {
        outros.pecas += i.quantidade;
        outros.custoPeca += i.custo * i.quantidade;
        outros.venda += i.preco_venda * i.quantidade;
        outros.lucro += i.lucro * i.quantidade;
      }
    }
  }
  const urls = await urlsAssinadas(supabase, pecas.map((p) => p.imagem_path));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/catalogos" className="text-sm text-zinc-500 hover:underline">
            ← Catálogos
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{catalogo.nome}</h1>
          <form action={excluirCatalogo} className="flex flex-wrap items-center gap-x-2 text-sm text-zinc-500">
            <span>{catalogo.total_pecas.toLocaleString("pt-BR")} peças · toque nas que você quer pedir</span>
            <input type="hidden" name="id" value={catalogo.id} />
            <span aria-hidden>·</span>
            <button type="submit" className="text-red-700 hover:underline">
              Excluir catálogo
            </button>
          </form>
        </div>
        <EscolherPedido rascunhos={rascunhos} atual={rascunho?.id ?? null} />
      </div>
      {outros.pecas > 0 && (
        <p className="mb-4 text-sm text-zinc-500">
          Este pedido já tem {outros.pecas} {outros.pecas === 1 ? "peça" : "peças"} de outros catálogos; o total abaixo inclui todas.
        </p>
      )}
      <MontarPedido
        key={rascunho?.id ?? "novo"}
        modo="catalogo"
        pedidoId={rascunho?.id ?? null}
        catalogoId={catalogo.id}
        pecas={pecas.map((p) => ({ id: p.id, codigo: p.codigo, custo: p.custo, pagina: p.pagina, url: p.imagem_path ? urls.get(p.imagem_path) ?? null : null }))}
        quantidadesIniciais={quantidades}
        outros={outros}
        regras={paraCalculo(regras)}
      />
    </>
  );
}
