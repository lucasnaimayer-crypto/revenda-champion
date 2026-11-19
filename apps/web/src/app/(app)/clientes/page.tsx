import Link from "next/link";
import { formatarReais } from "@revenda/regras";
import FormCliente from "@/componentes/cliente/FormCliente";
import { Botao, Cartao, Titulo, classeCampo } from "@/componentes/ui";
import { hojeISO, linkWhatsapp } from "@/lib/datas";
import { exigirRevendedor } from "@/lib/sessao";

export default async function Clientes({ searchParams }: PageProps<"/clientes">) {
  const { q, novo } = await searchParams;
  const busca = typeof q === "string" ? q.trim().replace(/[%_,()]/g, "") : "";
  const { supabase, revendedor, papel } = await exigirRevendedor();
  const dono = papel === "dono";

  let consulta = supabase.from("cliente").select("id, nome, telefone, cidade").eq("revendedor_id", revendedor.id).eq("ativo", true).order("nome");
  if (busca) consulta = consulta.or(`nome.ilike.%${busca}%,telefone.ilike.%${busca}%`);
  const [{ data: clientes, error }, vendas, pendentes] = await Promise.all([
    consulta,
    // A equipe não lê vendas: para ela essas consultas voltam vazias.
    dono
      ? supabase.from("venda").select("cliente_id, total_liquido, devolvido_receita, status").eq("revendedor_id", revendedor.id).not("cliente_id", "is", null)
      : Promise.resolve({ data: [] as { cliente_id: string; total_liquido: number; devolvido_receita: number; status: string }[] }),
    dono
      ? supabase.from("recebimento").select("valor, vencimento, venda:venda_id (cliente_id)").eq("revendedor_id", revendedor.id).eq("status", "pendente")
      : Promise.resolve({ data: [] as { valor: number; vencimento: string; venda: unknown }[] }),
  ]);
  if (error) throw new Error(error.message);

  const comprado = new Map<string, { total: number; compras: number }>();
  for (const v of vendas.data ?? []) {
    if (v.status === "cancelada") continue;
    const a = comprado.get(v.cliente_id) ?? { total: 0, compras: 0 };
    a.total += v.total_liquido - v.devolvido_receita;
    a.compras += 1;
    comprado.set(v.cliente_id, a);
  }
  const hoje = hojeISO();
  const devendo = new Map<string, { total: number; atrasado: boolean }>();
  for (const p of pendentes.data ?? []) {
    const cliente = (p.venda as { cliente_id: string | null } | null)?.cliente_id;
    if (!cliente) continue;
    const a = devendo.get(cliente) ?? { total: 0, atrasado: false };
    a.total += p.valor;
    a.atrasado ||= p.vencimento < hoje;
    devendo.set(cliente, a);
  }

  return (
    <>
      <Titulo
        acao={
          <Link href="/clientes?novo=1" className="rounded-lg bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escura">
            Novo cliente
          </Link>
        }
      >
        Clientes
      </Titulo>
      {novo === "1" && (
        <Cartao className="mb-6 max-w-2xl">
          <h2 className="mb-3 font-semibold">Novo cliente</h2>
          <FormCliente />
        </Cartao>
      )}
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={busca} placeholder="Buscar nome ou telefone" className={`${classeCampo} max-w-xs`} />
        <Botao variante="secundario" type="submit">
          Buscar
        </Botao>
      </form>
      {clientes.length === 0 ? (
        <Cartao>
          <p className="text-sm text-zinc-500">{busca ? "Nenhum cliente encontrado." : "Nenhum cliente ainda. Cadastre aqui ou direto na hora da venda."}</p>
        </Cartao>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">Telefone</th>
                {dono && <th className="hidden px-4 py-2 font-medium sm:table-cell">Comprou</th>}
                {dono && <th className="px-4 py-2 font-medium">Deve</th>}
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => {
                const whatsapp = linkWhatsapp(c.telefone);
                const compras = comprado.get(c.id);
                const deve = devendo.get(c.id);
                return (
                  <tr key={c.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                        {c.nome}
                      </Link>
                      {c.cidade && <span className="block text-xs text-zinc-500">{c.cidade}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {c.telefone ?? "—"}
                      {whatsapp && (
                        <a href={whatsapp} target="_blank" rel="noreferrer" className="ml-2 text-xs text-emerald-700 hover:underline">
                          WhatsApp
                        </a>
                      )}
                    </td>
                    {dono && (
                      <td className="hidden px-4 py-3 tabular-nums sm:table-cell">
                        {compras ? `${formatarReais(compras.total)} em ${compras.compras} compra(s)` : <span className="text-zinc-400">—</span>}
                      </td>
                    )}
                    {dono && (
                      <td className={`px-4 py-3 tabular-nums ${deve?.atrasado ? "font-medium text-red-700" : ""}`}>{deve ? formatarReais(deve.total) : <span className="text-zinc-400">—</span>}</td>
                    )}
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
