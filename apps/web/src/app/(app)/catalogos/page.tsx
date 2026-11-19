import Link from "next/link";
import { Aviso, Cartao, Titulo } from "@/componentes/ui";
import { urlsAssinadas } from "@/lib/arquivos";
import { carregarRascunhos, escolherRascunho } from "@/lib/rascunhos";
import { exigirDono } from "@/lib/sessao";

const STATUS: Record<string, string> = { processando: "Processando", erro: "Com erro" };

export default async function Catalogos({ searchParams }: PageProps<"/catalogos">) {
  const { salvo, pedido: escolhido } = await searchParams;
  const { supabase, revendedor } = await exigirDono();
  const [{ data, error }, rascunhos] = await Promise.all([
    supabase
      .from("catalogo")
      .select("id, nome, status, origem, total_pecas, criado_em, catalogo_peca (imagem_path)")
      .eq("revendedor_id", revendedor.id)
      .not("catalogo_peca.imagem_path", "is", null)
      .order("criado_em", { ascending: false })
      .order("pagina", { referencedTable: "catalogo_peca" })
      .order("posicao", { referencedTable: "catalogo_peca" })
      .limit(1, { referencedTable: "catalogo_peca" }),
    carregarRascunhos(supabase, revendedor.id),
  ]);
  if (error) throw new Error(error.message);
  const capas = await urlsAssinadas(supabase, data.map((c) => c.catalogo_peca[0]?.imagem_path));
  const novo = data.find((c) => c.id === salvo);
  const rascunho = escolherRascunho(rascunhos, escolhido);
  const sufixo = rascunho && typeof escolhido === "string" ? `?pedido=${rascunho.id}` : "";

  return (
    <>
      <Titulo
        acao={
          <Link href="/catalogos/novo" className="rounded-lg bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escura">
            Subir catálogo
          </Link>
        }
      >
        Catálogos
      </Titulo>
      {novo && (
        <div className="mb-4">
          <Aviso tipo="ok">
            Catálogo “{novo.nome}” salvo com {novo.total_pecas} peças. Toque nele para escolher as peças do pedido.
          </Aviso>
        </div>
      )}
      {rascunho && rascunho.pecas > 0 && (
        <p className="mb-4 text-sm text-zinc-500">
          Montando o{" "}
          <Link href={`/pedidos/${rascunho.id}`} className="font-medium text-marca hover:underline">
            pedido nº {rascunho.numero}
          </Link>{" "}
          ({rascunho.pecas} {rascunho.pecas === 1 ? "peça" : "peças"}). Abra outro catálogo para juntar mais peças no mesmo pedido.
        </p>
      )}
      {data.length === 0 ? (
        <Cartao>
          <p className="text-sm text-zinc-500">Nenhum catálogo ainda. Suba o PDF que o representante enviou.</p>
        </Cartao>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((c) => {
            const capa = c.catalogo_peca[0]?.imagem_path ? capas.get(c.catalogo_peca[0].imagem_path) : undefined;
            return (
              <li key={c.id}>
                <Link
                  href={`/catalogos/${c.id}${sufixo}`}
                  className={`block overflow-hidden rounded-xl border bg-white transition hover:shadow-md ${c.id === salvo ? "border-marca ring-1 ring-marca" : "border-zinc-200"}`}
                >
                  <div className="relative aspect-[4/3] bg-zinc-100">
                    {capa ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage
                      <img src={capa} alt="" loading="lazy" className="h-full w-full object-contain p-3" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">sem foto</span>
                    )}
                    <span className="absolute left-2 top-2 rounded bg-tinta px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      {c.origem === "imagem" ? "Fotos" : c.origem === "champion" ? "Champion" : "PDF"}
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 font-medium leading-snug">{c.nome}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {c.total_pecas} peças · {new Date(c.criado_em).toLocaleDateString("pt-BR")}
                      {STATUS[c.status] && <span className="ml-1 text-amber-700">· {STATUS[c.status]}</span>}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
