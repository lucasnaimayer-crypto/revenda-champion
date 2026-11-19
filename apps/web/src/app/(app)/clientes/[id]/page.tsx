import Link from "next/link";
import { notFound } from "next/navigation";
import { formatarReais } from "@revenda/regras";
import FormCliente from "@/componentes/cliente/FormCliente";
import Situacao from "@/componentes/Situacao";
import { Botao, Cartao, Titulo } from "@/componentes/ui";
import { formatarData, hojeISO, linkWhatsapp } from "@/lib/datas";
import { exigirRevendedor } from "@/lib/sessao";
import { arquivarCliente } from "../acoes";

export default async function Cliente({ params }: PageProps<"/clientes/[id]">) {
  const { id } = await params;
  const { supabase, papel } = await exigirRevendedor();
  const dono = papel === "dono";
  const { data: cliente } = await supabase.from("cliente").select("*").eq("id", id).maybeSingle();
  if (!cliente) notFound();
  const [{ data: vendas }, { data: pendentes }] = dono
    ? await Promise.all([
        supabase.from("venda").select("id, numero, data, status, pecas, total_liquido, devolvido_receita").eq("cliente_id", id).order("data", { ascending: false }),
        supabase.from("recebimento").select("valor, vencimento, venda!inner (cliente_id)").eq("venda.cliente_id", id).eq("status", "pendente"),
      ])
    : [{ data: [] }, { data: [] }];
  const hoje = hojeISO();
  const deve = (pendentes ?? []).reduce((s, p) => s + p.valor, 0);
  const atrasado = (pendentes ?? []).filter((p) => p.vencimento < hoje).reduce((s, p) => s + p.valor, 0);
  const total = (vendas ?? []).filter((v) => v.status !== "cancelada").reduce((s, v) => s + v.total_liquido - v.devolvido_receita, 0);
  const whatsapp = linkWhatsapp(cliente.telefone);

  return (
    <>
      <Titulo
        acao={
          <div className="flex flex-wrap gap-2">
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                WhatsApp
              </a>
            )}
            {dono && (
              <Link href={`/vendas/nova?cliente=${cliente.id}`} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
                Nova venda
              </Link>
            )}
          </div>
        }
      >
        <span className="flex items-center gap-3">
          {cliente.nome}
          {!cliente.ativo && <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">Arquivado</span>}
        </span>
      </Titulo>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {dono && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Cartao>
                <p className="text-sm text-zinc-500">Já comprou</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{formatarReais(total)}</p>
              </Cartao>
              <Cartao>
                <p className="text-sm text-zinc-500">Deve</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{formatarReais(deve)}</p>
              </Cartao>
              <Cartao>
                <p className="text-sm text-zinc-500">Atrasado</p>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${atrasado > 0 ? "text-red-700" : ""}`}>{formatarReais(atrasado)}</p>
              </Cartao>
            </div>
          )}
          {dono && (
            <section>
              <h2 className="mb-2 font-semibold">Compras</h2>
              {(vendas ?? []).length === 0 ? (
                <Cartao>
                  <p className="text-sm text-zinc-500">Nenhuma compra ainda.</p>
                </Cartao>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
                  <table className="w-full text-sm">
                    <tbody>
                      {(vendas ?? []).map((v) => (
                        <tr key={v.id} className="border-t border-zinc-100 first:border-t-0">
                          <td className="px-4 py-3">
                            <Link href={`/vendas/${v.id}`} className="font-medium hover:underline">
                              Venda nº {v.numero}
                            </Link>
                          </td>
                          <td className="px-4 py-3">{formatarData(v.data)}</td>
                          <td className="px-4 py-3 tabular-nums">{v.pecas} peça(s)</td>
                          <td className="px-4 py-3 tabular-nums">{formatarReais(v.total_liquido)}</td>
                          <td className="px-4 py-3">
                            <Situacao status={v.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
        <div className="space-y-4">
          <Cartao>
            <FormCliente cliente={cliente} />
          </Cartao>
          {dono && (
            <form action={arquivarCliente}>
              <input type="hidden" name="id" value={cliente.id} />
              <input type="hidden" name="ativo" value={cliente.ativo ? "nao" : "sim"} />
              <Botao variante="secundario" type="submit">
                {cliente.ativo ? "Arquivar cliente" : "Voltar para a lista"}
              </Botao>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
