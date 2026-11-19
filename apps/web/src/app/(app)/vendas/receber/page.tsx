import Link from "next/link";
import { formatarReais } from "@revenda/regras";
import Situacao from "@/componentes/Situacao";
import { Cartao, Titulo } from "@/componentes/ui";
import { BotaoParcela } from "@/componentes/venda/AcoesVenda";
import { formatarData, hojeISO, linkWhatsapp } from "@/lib/datas";
import { exigirDono } from "@/lib/sessao";

interface Linha {
  id: string;
  parcela: number;
  valor: number;
  vencimento: string;
  venda: { id: string; numero: number; cliente: { id: string; nome: string; telefone: string | null } | null } | null;
}

export default async function AReceber() {
  const { supabase, revendedor } = await exigirDono();
  const { data, error } = await supabase
    .from("recebimento")
    .select("id, parcela, valor, vencimento, venda:venda_id (id, numero, cliente:cliente_id (id, nome, telefone))")
    .eq("revendedor_id", revendedor.id)
    .eq("status", "pendente")
    .order("vencimento")
    .order("parcela");
  if (error) throw new Error(error.message);
  const linhas = data as unknown as Linha[];
  const hoje = hojeISO();
  const atrasadas = linhas.filter((l) => l.vencimento < hoje);
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  const totalAtrasado = atrasadas.reduce((s, l) => s + l.valor, 0);

  // Quem está devendo: soma por cliente.
  const porCliente = new Map<string, { nome: string; telefone: string | null; id: string | null; total: number; atrasado: number }>();
  for (const l of linhas) {
    const c = l.venda?.cliente;
    const chave = c?.id ?? "sem";
    const atual = porCliente.get(chave) ?? { nome: c?.nome ?? "Sem cliente", telefone: c?.telefone ?? null, id: c?.id ?? null, total: 0, atrasado: 0 };
    atual.total += l.valor;
    if (l.vencimento < hoje) atual.atrasado += l.valor;
    porCliente.set(chave, atual);
  }
  const devedores = [...porCliente.values()].sort((a, b) => b.atrasado - a.atrasado || b.total - a.total);

  return (
    <>
      <Titulo>A receber</Titulo>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Cartao>
          <p className="text-sm text-zinc-500">Total a receber</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatarReais(total)}</p>
        </Cartao>
        <Cartao>
          <p className="text-sm text-zinc-500">Atrasado</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${totalAtrasado > 0 ? "text-red-700" : ""}`}>{formatarReais(totalAtrasado)}</p>
        </Cartao>
        <Cartao>
          <p className="text-sm text-zinc-500">Parcelas em aberto</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{linhas.length}</p>
        </Cartao>
      </div>

      {linhas.length === 0 ? (
        <Cartao>
          <p className="text-sm text-zinc-500">Nada a receber. Vendas a prazo aparecem aqui com cada parcela.</p>
        </Cartao>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Vencimento</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Venda</th>
                  <th className="px-3 py-2 font-medium">Valor</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className="border-t border-zinc-100">
                    <td className="px-3 py-2">
                      <span className="mr-2">{formatarData(l.vencimento)}</span>
                      {l.vencimento < hoje && <Situacao status="atrasado" />}
                    </td>
                    <td className="px-3 py-2">{l.venda?.cliente?.nome ?? <span className="text-zinc-400">—</span>}</td>
                    <td className="px-3 py-2">
                      {l.venda && (
                        <Link href={`/vendas/${l.venda.id}`} className="hover:underline">
                          nº {l.venda.numero} · parc. {l.parcela}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatarReais(l.valor)}</td>
                    <td className="px-3 py-2 text-right">
                      <BotaoParcela id={l.id} recebido={false} hoje={hoje} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Cartao>
            <h2 className="mb-3 font-semibold">Quem está devendo</h2>
            <ul className="space-y-2 text-sm">
              {devedores.map((d) => {
                const whatsapp = linkWhatsapp(d.telefone);
                return (
                  <li key={d.id ?? "sem"} className="flex items-start justify-between gap-3">
                    <span>
                      {d.id ? (
                        <Link href={`/clientes/${d.id}`} className="font-medium hover:underline">
                          {d.nome}
                        </Link>
                      ) : (
                        <span className="text-zinc-500">{d.nome}</span>
                      )}
                      {whatsapp && (
                        <a href={whatsapp} target="_blank" rel="noreferrer" className="ml-2 text-xs text-emerald-700 hover:underline">
                          WhatsApp
                        </a>
                      )}
                    </span>
                    <span className="text-right tabular-nums">
                      {formatarReais(d.total)}
                      {d.atrasado > 0 && <span className="block text-xs text-red-700">{formatarReais(d.atrasado)} atrasado</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Cartao>
        </div>
      )}
    </>
  );
}
