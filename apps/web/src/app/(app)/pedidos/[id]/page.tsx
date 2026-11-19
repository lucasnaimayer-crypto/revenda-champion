import Link from "next/link";
import { notFound } from "next/navigation";
import { formatarReais } from "@revenda/regras";
import AcoesPedido from "@/componentes/pedido/AcoesPedido";
import MontarPedido from "@/componentes/pedido/MontarPedido";
import Situacao from "@/componentes/Situacao";
import { Botao, Cartao, Titulo } from "@/componentes/ui";
import { urlsAssinadas } from "@/lib/arquivos";
import { carregarRegras, paraCalculo } from "@/lib/regras";
import { exigirDono } from "@/lib/sessao";
import { excluirPedido, removerItem } from "../acoes";

export default async function Pedido({ params }: PageProps<"/pedidos/[id]">) {
  const { id } = await params;
  const { supabase, revendedor } = await exigirDono();
  const { data: pedido } = await supabase
    .from("pedido")
    .select("id, numero, nome, status, criado_em, enviado_em, confirmado_em, recebido_em")
    .eq("id", id)
    .maybeSingle();
  if (!pedido) notFound();

  const { data: itens, error } = await supabase
    .from("pedido_item")
    .select("id, catalogo_peca_id, codigo, quantidade, quantidade_recebida, custo, custo_total, preco_venda, lucro, imagem_path")
    .eq("pedido_id", id)
    .order("codigo");
  if (error) throw new Error(error.message);

  const titulo = (
    <span className="flex flex-wrap items-center gap-3">
      Pedido nº {pedido.numero} · {pedido.nome} <Situacao status={pedido.status} />
    </span>
  );

  if (pedido.status === "rascunho") {
    const [{ data: origem }, regras] = await Promise.all([
      supabase
        .from("pedido_item")
        .select("id, catalogo_peca_id, catalogo_peca (pagina, custo, catalogo (nome))")
        .eq("pedido_id", id),
      carregarRegras(supabase, revendedor.id),
    ]);
    const porItem = new Map((origem ?? []).map((o) => [o.id, o.catalogo_peca as unknown as { pagina: number; custo: number; catalogo: { nome: string } | null } | null]));
    const urls = await urlsAssinadas(supabase, itens.map((i) => i.imagem_path));
    const ligados = itens.filter((i) => i.catalogo_peca_id && porItem.get(i.id));
    const soltos = itens.filter((i) => !i.catalogo_peca_id || !porItem.get(i.id));
    const quantidades: Record<string, number> = {};
    for (const i of ligados) quantidades[i.catalogo_peca_id!] = i.quantidade;
    const outros = {
      pecas: soltos.reduce((s, i) => s + i.quantidade, 0),
      custoPeca: soltos.reduce((s, i) => s + i.custo * i.quantidade, 0),
      venda: soltos.reduce((s, i) => s + i.preco_venda * i.quantidade, 0),
      lucro: soltos.reduce((s, i) => s + i.lucro * i.quantidade, 0),
    };
    return (
      <>
        <Titulo
          acao={
            <div className="flex flex-wrap gap-2">
              <Link href={`/catalogos?pedido=${pedido.id}`} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50">
                Adicionar peças de um catálogo
              </Link>
              <form action={excluirPedido}>
                <input type="hidden" name="pedido_id" value={pedido.id} />
                <Botao variante="perigo" type="submit">
                  Excluir rascunho
                </Botao>
              </form>
            </div>
          }
        >
          {titulo}
        </Titulo>
        {itens.length === 0 ? (
          <Cartao>
            <p className="text-sm text-zinc-500">
              Nenhuma peça ainda. <Link href={`/catalogos?pedido=${pedido.id}`} className="text-marca underline">Abra um catálogo</Link> e toque nas peças que você quer.
            </p>
          </Cartao>
        ) : (
          <p className="mb-4 text-sm text-zinc-500">Confira as peças e as quantidades. Para tirar uma peça, toque na foto ou deixe a quantidade em zero.</p>
        )}
        {soltos.length > 0 && (
          <Cartao className="mb-4">
            <p className="mb-2 text-sm text-zinc-500">Peças de catálogos que foram excluídos:</p>
            <ul className="divide-y divide-zinc-100 text-sm">
              {soltos.map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2">
                  <span>
                    <span className="font-mono">{i.codigo}</span> · {i.quantidade} × {formatarReais(i.custo)}
                  </span>
                  <form action={removerItem}>
                    <input type="hidden" name="item_id" value={i.id} />
                    <input type="hidden" name="pedido_id" value={pedido.id} />
                    <button type="submit" className="text-red-700 hover:underline">
                      Tirar
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </Cartao>
        )}
        {(ligados.length > 0 || soltos.length > 0) && (
          <MontarPedido
            modo="pedido"
            pedidoId={pedido.id}
            pecas={ligados.map((i) => {
              const peca = porItem.get(i.id)!;
              return {
                id: i.catalogo_peca_id!,
                codigo: i.codigo,
                custo: peca.custo,
                pagina: peca.pagina,
                catalogo: peca.catalogo?.nome,
                url: i.imagem_path ? urls.get(i.imagem_path) ?? null : null,
              };
            })}
            quantidadesIniciais={quantidades}
            outros={outros}
            regras={paraCalculo(regras)}
          />
        )}
      </>
    );
  }

  const urls = await urlsAssinadas(supabase, itens.map((i) => i.imagem_path));
  const pecas = itens.reduce((s, i) => s + i.quantidade, 0);
  const recebidas = itens.reduce((s, i) => s + (i.quantidade_recebida ?? 0), 0);
  const custo = itens.reduce((s, i) => s + i.custo * i.quantidade, 0);
  const venda = itens.reduce((s, i) => s + i.preco_venda * i.quantidade, 0);
  const lucro = itens.reduce((s, i) => s + i.lucro * i.quantidade, 0);
  const datas = [
    ["Criado", pedido.criado_em],
    ["Enviado", pedido.enviado_em],
    ["Confirmado", pedido.confirmado_em],
    ["Recebido", pedido.recebido_em],
  ].filter(([, d]) => d) as [string, string][];

  return (
    <>
      <Titulo>{titulo}</Titulo>
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Indicador rotulo={pedido.status === "recebido" ? "Peças recebidas" : "Peças"} valor={pedido.status === "recebido" ? `${recebidas} de ${pecas}` : String(pecas)} />
        <Indicador rotulo="Custo do pedido" valor={formatarReais(custo)} />
        <Indicador rotulo="Venda prevista" valor={formatarReais(venda)} />
        <Indicador rotulo="Lucro previsto" valor={formatarReais(lucro)} />
      </div>
      <Cartao className="mb-6">
        <AcoesPedido
          pedidoId={pedido.id}
          numero={pedido.numero}
          status={pedido.status}
          cabecalho={{
            titulo: `Pedido nº ${pedido.numero} · ${pedido.nome}`,
            revendedor: [revendedor.nome, [revendedor.cidade, revendedor.uf].filter(Boolean).join("/")].filter(Boolean).join(" · "),
            contato: revendedor.telefone,
            data: new Date(pedido.enviado_em ?? pedido.criado_em).toLocaleDateString("pt-BR"),
          }}
          itens={itens.map((i) => ({ codigo: i.codigo, quantidade: i.quantidade, custo: i.custo, url: i.imagem_path ? urls.get(i.imagem_path) ?? null : null }))}
        />
        <p className="mt-3 text-xs text-zinc-500">{datas.map(([r, d]) => `${r} em ${new Date(d).toLocaleDateString("pt-BR")}`).join(" · ")}</p>
      </Cartao>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Peça</th>
              <th className="px-3 py-2 font-medium">Qtd.</th>
              {pedido.status === "recebido" && <th className="px-3 py-2 font-medium">Recebidas</th>}
              <th className="px-3 py-2 font-medium">Custo un.</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">Custo total un.</th>
              <th className="px-3 py-2 font-medium">Venda un.</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Lucro</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const url = i.imagem_path ? urls.get(i.imagem_path) : undefined;
              return (
                <tr key={i.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-11 shrink-0 overflow-hidden rounded bg-zinc-100">
                        {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage */}
                        {url && <img src={url} alt="" className="h-full w-full object-contain" />}
                      </div>
                      <span className="font-mono">{i.codigo}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{i.quantidade}</td>
                  {pedido.status === "recebido" && (
                    <td className={`px-3 py-2 tabular-nums ${i.quantidade_recebida !== i.quantidade ? "font-semibold text-amber-700" : ""}`}>{i.quantidade_recebida ?? 0}</td>
                  )}
                  <td className="px-3 py-2 tabular-nums">{formatarReais(i.custo)}</td>
                  <td className="hidden px-3 py-2 tabular-nums sm:table-cell">{formatarReais(i.custo_total)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatarReais(i.preco_venda)}</td>
                  <td className="hidden px-3 py-2 tabular-nums text-emerald-700 md:table-cell">{formatarReais(i.lucro * i.quantidade)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pedido.status === "recebido" && (
        <p className="mt-4 text-sm">
          <Link href="/estoque" className="underline">
            Ver estoque
          </Link>
        </p>
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
