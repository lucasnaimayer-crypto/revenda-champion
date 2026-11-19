import { headers } from "next/headers";
import Abas from "@/componentes/configuracoes/Abas";
import { CopiarLink, FormConvite } from "@/componentes/configuracoes/Equipe";
import { Botao, Cartao, Titulo } from "@/componentes/ui";
import { exigirDono } from "@/lib/sessao";
import { cancelarConvite, removerMembro } from "./acoes";

export default async function Equipe() {
  const { supabase, revendedor, usuarioId, email } = await exigirDono();
  const [{ data: membros }, { data: convites }] = await Promise.all([
    supabase.from("membro").select("id, usuario_id, papel, email, criado_em").eq("revendedor_id", revendedor.id).order("criado_em"),
    supabase
      .from("convite")
      .select("id, email, token, expira_em")
      .eq("revendedor_id", revendedor.id)
      .is("aceito_em", null)
      .is("cancelado_em", null)
      .gt("expira_em", new Date().toISOString())
      .order("criado_em", { ascending: false }),
  ]);
  const h = await headers();
  const origem = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  return (
    <>
      <Titulo>Configurações</Titulo>
      <Abas atual="/configuracoes/equipe" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao>
          <h2 className="font-semibold">Convidar alguém</h2>
          <p className="mb-4 mt-1 text-sm text-zinc-500">
            A equipe consulta o estoque com preços e cadastra clientes. Não vê custos, lucro, regras, catálogos, pedidos nem vendas.
          </p>
          <FormConvite />
          {(convites ?? []).length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-medium">Convites esperando</h3>
              <ul className="space-y-3">
                {(convites ?? []).map((c) => (
                  <li key={c.id} className="space-y-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span>{c.email}</span>
                      <form action={cancelarConvite}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="text-xs text-red-700 hover:underline">
                          Cancelar
                        </button>
                      </form>
                    </div>
                    <CopiarLink link={`${origem}/convite/${c.token}`} />
                    <p className="text-xs text-zinc-500">Vale até {new Date(c.expira_em).toLocaleDateString("pt-BR")}. A pessoa precisa entrar com este e-mail.</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Cartao>
        <Cartao>
          <h2 className="mb-3 font-semibold">Quem tem acesso</h2>
          <ul className="divide-y divide-zinc-100 text-sm">
            {(membros ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {m.usuario_id === usuarioId ? (email ?? "Você") : (m.email ?? "Membro")}
                  <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{m.papel === "dono" ? "Dono" : "Equipe"}</span>
                </span>
                {m.papel === "equipe" && (
                  <form action={removerMembro}>
                    <input type="hidden" name="id" value={m.id} />
                    <Botao variante="perigo" type="submit" className="px-2 py-1 text-xs">
                      Remover
                    </Botao>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Cartao>
      </div>
    </>
  );
}
