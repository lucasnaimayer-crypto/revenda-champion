import Link from "next/link";
import { formatarReais, resultadoDaVenda } from "@revenda/regras";
import Situacao from "@/componentes/Situacao";
import { Cartao, Titulo } from "@/componentes/ui";
import { formatarData, hojeISO, limitesDoMes, mesISO, nomeDoMes, somarMesISO } from "@/lib/datas";
import { exigirDono } from "@/lib/sessao";

export default async function Vendas({ searchParams }: PageProps<"/vendas">) {
  const { mes: mesParam } = await searchParams;
  const mes = typeof mesParam === "string" && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : mesISO();
  const { inicio, fim } = limitesDoMes(mes);
  const { supabase, revendedor } = await exigirDono();
  const [{ data: vendas, error }, { data: pendentes }] = await Promise.all([
    supabase
      .from("venda")
      .select(
        "id, numero, data, status, pecas, total_liquido, custo_total, comissao_total, devolvido_pecas, devolvido_receita, devolvido_custo, comissao_revertida, cliente:cliente_id (nome)"
      )
      .eq("revendedor_id", revendedor.id)
      .gte("data", inicio)
      .lte("data", fim)
      .order("data", { ascending: false })
      .order("numero", { ascending: false }),
    supabase.from("recebimento").select("valor, vencimento").eq("revendedor_id", revendedor.id).eq("status", "pendente"),
  ]);
  if (error) throw new Error(error.message);

  const linhas = vendas.map((v) => ({
    ...v,
    cliente: (v.cliente as unknown as { nome: string } | null)?.nome ?? null,
    resultado: resultadoDaVenda({
      status: v.status as "concluida",
      pecas: v.pecas,
      totalLiquido: v.total_liquido,
      custoTotal: v.custo_total,
      comissaoTotal: v.comissao_total,
      devolvidoPecas: v.devolvido_pecas,
      devolvidoReceita: v.devolvido_receita,
      devolvidoCusto: v.devolvido_custo,
      comissaoRevertida: v.comissao_revertida,
    }),
  }));
  const validas = linhas.filter((l) => l.status !== "cancelada");
  const faturamento = linhas.reduce((s, l) => s + l.resultado.faturamento, 0);
  const lucro = linhas.reduce((s, l) => s + l.resultado.lucro, 0);
  const hoje = hojeISO();
  const aReceber = (pendentes ?? []).reduce((s, p) => s + p.valor, 0);
  const atrasado = (pendentes ?? []).filter((p) => p.vencimento < hoje).reduce((s, p) => s + p.valor, 0);

  return (
    <>
      <Titulo
        acao={
          <div className="flex gap-2">
            <Link href="/vendas/receber" className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50">
              A receber
            </Link>
            <Link href="/vendas/nova" className="rounded-lg bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escura">
              Nova venda
            </Link>
          </div>
        }
      >
        Vendas
      </Titulo>

      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link href={`/vendas?mes=${somarMesISO(mes, -1)}`} className="rounded-lg border border-zinc-300 bg-white px-3 py-1 hover:bg-zinc-50" aria-label="Mês anterior">
          ←
        </Link>
        <span className="min-w-36 text-center font-medium">{nomeDoMes(mes)}</span>
        <Link href={`/vendas?mes=${somarMesISO(mes, 1)}`} className="rounded-lg border border-zinc-300 bg-white px-3 py-1 hover:bg-zinc-50" aria-label="Próximo mês">
          →
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Vendas no mês" valor={validas.length.toLocaleString("pt-BR")} />
        <Indicador rotulo="Faturamento" valor={formatarReais(faturamento)} />
        <Indicador rotulo="Lucro" valor={formatarReais(lucro)} cor={lucro >= 0 ? "text-emerald-700" : "text-red-700"} />
        <Indicador rotulo="A receber (todas)" valor={formatarReais(aReceber)} detalhe={atrasado > 0 ? `${formatarReais(atrasado)} atrasado` : undefined} />
      </div>

      {linhas.length === 0 ? (
        <Cartao>
          <p className="text-sm text-zinc-500">Nenhuma venda em {nomeDoMes(mes).toLowerCase()}.</p>
        </Cartao>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nº</th>
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Peças</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">Lucro</th>
                <th className="px-4 py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((v) => (
                <tr key={v.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3 tabular-nums">
                    <Link href={`/vendas/${v.id}`} className="font-medium hover:underline">
                      {v.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{formatarData(v.data)}</td>
                  <td className="px-4 py-3">{v.cliente ?? <span className="text-zinc-400">—</span>}</td>
                  <td className="hidden px-4 py-3 tabular-nums sm:table-cell">{v.resultado.pecas}</td>
                  <td className="px-4 py-3 tabular-nums">{formatarReais(v.status === "cancelada" ? v.total_liquido : v.resultado.faturamento)}</td>
                  <td className={`hidden px-4 py-3 tabular-nums md:table-cell ${v.resultado.lucro >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatarReais(v.resultado.lucro)}</td>
                  <td className="px-4 py-3">
                    <Situacao status={v.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Indicador({ rotulo, valor, cor = "", detalhe }: { rotulo: string; valor: string; cor?: string; detalhe?: string }) {
  return (
    <Cartao>
      <p className="text-sm text-zinc-500">{rotulo}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${cor}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-red-700">{detalhe}</p>}
    </Cartao>
  );
}
