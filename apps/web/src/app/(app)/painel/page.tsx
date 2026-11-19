import Link from "next/link";
import { Cartao, Titulo } from "@/componentes/ui";
import { exigirRevendedor } from "@/lib/sessao";

export default async function Painel() {
  const { supabase, revendedor, papel } = await exigirRevendedor();
  const [catalogos, pecas, produtos] = await Promise.all([
    supabase.from("catalogo").select("id", { count: "exact", head: true }).eq("revendedor_id", revendedor.id),
    supabase.from("catalogo_peca").select("id", { count: "exact", head: true }).eq("revendedor_id", revendedor.id),
    supabase.from("produto").select("id", { count: "exact", head: true }).eq("revendedor_id", revendedor.id),
  ]);
  const indicadores = [
    { rotulo: "Catálogos", valor: catalogos.count ?? 0 },
    { rotulo: "Peças nos catálogos", valor: pecas.count ?? 0 },
    { rotulo: "Produtos no estoque", valor: produtos.count ?? 0 },
  ];
  return (
    <>
      <Titulo>Olá, {revendedor.nome}</Titulo>
      <div className="grid gap-4 sm:grid-cols-3">
        {indicadores.map((i) => (
          <Cartao key={i.rotulo}>
            <p className="text-sm text-zinc-500">{i.rotulo}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{i.valor.toLocaleString("pt-BR")}</p>
          </Cartao>
        ))}
      </div>
      {papel === "dono" && (catalogos.count ?? 0) === 0 && (
        <Cartao className="mt-6">
          <h2 className="font-semibold">Comece pelo catálogo do representante</h2>
          <p className="mt-1 text-sm text-zinc-500">Envie o PDF e o sistema separa cada relógio com foto, código e preço.</p>
          <Link href="/catalogos/novo" className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
            Subir catálogo
          </Link>
        </Cartao>
      )}
    </>
  );
}
