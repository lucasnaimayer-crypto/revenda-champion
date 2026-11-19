import { calcularPeca, formatarReais } from "@revenda/regras";
import { Cartao, Titulo, Botao, classeCampo } from "@/componentes/ui";
import { urlsAssinadas } from "@/lib/arquivos";
import { carregarRegras } from "@/lib/regras";
import { exigirRevendedor } from "@/lib/sessao";

export default async function Estoque({ searchParams }: PageProps<"/estoque">) {
  const { q } = await searchParams;
  const busca = typeof q === "string" ? q.trim().toUpperCase().replace(/[%_]/g, "") : "";
  const { supabase, revendedor, papel } = await exigirRevendedor();
  const dono = papel === "dono";

  let consulta = supabase.from("produto").select("id, codigo, descricao, custo, preco_manual, imagem_path").eq("revendedor_id", revendedor.id).eq("ativo", true).order("codigo");
  if (busca) consulta = consulta.ilike("codigo", `%${busca}%`);
  const [{ data: produtos, error }, { data: saldos }] = await Promise.all([
    consulta,
    supabase.from("estoque_saldo").select("produto_id, saldo").eq("revendedor_id", revendedor.id),
  ]);
  if (error) throw new Error(error.message);
  // A equipe não lê as regras de preço; para ela o preço só aparece quando foi definido à mão.
  const regras = dono ? await carregarRegras(supabase, revendedor.id) : null;
  const saldo = new Map((saldos ?? []).map((s) => [s.produto_id, s.saldo]));
  const urls = await urlsAssinadas(supabase, produtos.map((p) => p.imagem_path));

  const linhas = produtos.map((p) => {
    const calc = regras ? calcularPeca({ custo: p.custo, regra: regras.regra, custos: regras.custos, precoManual: p.preco_manual }) : null;
    return { ...p, saldo: saldo.get(p.id) ?? 0, venda: calc?.precoVenda ?? p.preco_manual ?? null, custoTotal: calc?.custoTotal ?? null };
  });
  const pecas = linhas.reduce((s, l) => s + Math.max(0, l.saldo), 0);
  const valorCusto = linhas.reduce((s, l) => s + Math.max(0, l.saldo) * (l.custoTotal ?? 0), 0);
  const valorVenda = linhas.reduce((s, l) => s + Math.max(0, l.saldo) * (l.venda ?? 0), 0);

  return (
    <>
      <Titulo>Estoque</Titulo>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Cartao>
          <p className="text-sm text-zinc-500">Peças em estoque</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{pecas.toLocaleString("pt-BR")}</p>
        </Cartao>
        {dono && (
          <>
            <Cartao>
              <p className="text-sm text-zinc-500">Valor de custo</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatarReais(valorCusto)}</p>
            </Cartao>
            <Cartao>
              <p className="text-sm text-zinc-500">Valor de venda</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatarReais(valorVenda)}</p>
            </Cartao>
          </>
        )}
      </div>
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={busca} placeholder="Buscar código" className={`${classeCampo} max-w-xs`} />
        <Botao variante="secundario" type="submit">
          Buscar
        </Botao>
      </form>
      {linhas.length === 0 ? (
        <Cartao>
          <p className="text-sm text-zinc-500">{busca ? "Nenhum produto com esse código." : "O estoque está vazio. As peças entram quando você recebe um pedido."}</p>
        </Cartao>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Produto</th>
                <th className="px-3 py-2 font-medium">Em estoque</th>
                {dono && <th className="px-3 py-2 font-medium">Custo total un.</th>}
                <th className="px-3 py-2 font-medium">Preço de venda</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const url = l.imagem_path ? urls.get(l.imagem_path) : undefined;
                return (
                  <tr key={l.id} className="border-t border-zinc-100">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <div className="h-14 w-11 shrink-0 overflow-hidden rounded bg-zinc-100">
                          {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage */}
                          {url && <img src={url} alt="" className="h-full w-full object-contain" />}
                        </div>
                        <div>
                          <p className="font-mono">{l.codigo}</p>
                          {l.descricao && <p className="text-xs text-zinc-500">{l.descricao}</p>}
                        </div>
                      </div>
                    </td>
                    <td className={`px-3 py-2 tabular-nums ${l.saldo <= 0 ? "text-zinc-400" : "font-medium"}`}>{l.saldo}</td>
                    {dono && <td className="px-3 py-2 tabular-nums">{formatarReais(l.custoTotal ?? 0)}</td>}
                    <td className="px-3 py-2 tabular-nums">{l.venda != null ? formatarReais(l.venda) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
