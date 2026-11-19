import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso, Botao, Cartao } from "@/componentes/ui";
import { exigirUsuario } from "@/lib/sessao";
import { sair } from "../../entrar/acoes";

async function aceitar(form: FormData) {
  "use server";
  const token = String(form.get("token") ?? "");
  const { supabase } = await exigirUsuario();
  const { error } = await supabase.rpc("aceitar_convite", { p_token: token });
  if (error) redirect(`/convite/${encodeURIComponent(token)}?erro=${encodeURIComponent(error.message)}`);
  redirect("/painel");
}

export default async function Convite({ params, searchParams }: PageProps<"/convite/[token]">) {
  const { token } = await params;
  const { erro } = await searchParams;
  const { supabase, email } = await exigirUsuario();
  const { data } = await supabase.rpc("ver_convite", { p_token: token });
  const convite = (data as { revendedor: string; email: string; situacao: string }[] | null)?.[0];
  const emailCerto = convite && email && convite.email.toLowerCase() === email.toLowerCase();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Cartao>
          {!convite ? (
            <p className="text-sm text-zinc-600">Convite não encontrado. Confira o link com quem convidou você.</p>
          ) : convite.situacao !== "valido" ? (
            <p className="text-sm text-zinc-600">
              Este convite {convite.situacao === "aceito" ? "já foi usado" : convite.situacao === "expirado" ? "expirou" : "foi cancelado"}.{" "}
              {convite.situacao === "aceito" ? (
                <Link href="/painel" className="font-medium underline">
                  Abrir o painel
                </Link>
              ) : (
                "Peça um novo para quem convidou você."
              )}
            </p>
          ) : (
            <form action={aceitar} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <h1 className="text-lg font-semibold">Convite de {convite.revendedor}</h1>
              <p className="text-sm text-zinc-600">Você vai entrar na equipe e poderá consultar o estoque e cadastrar clientes.</p>
              {!emailCerto && (
                <Aviso tipo="info">
                  O convite é para {convite.email}, mas você entrou como {email}. Saia e entre com o e-mail do convite.
                </Aviso>
              )}
              {!emailCerto && (
                <Botao variante="secundario" type="submit" formAction={sair} formNoValidate className="w-full">
                  Sair desta conta
                </Botao>
              )}
              {typeof erro === "string" && <Aviso>{erro.charAt(0).toUpperCase() + erro.slice(1)}.</Aviso>}
              <Botao type="submit" disabled={!emailCerto} className="w-full">
                Aceitar convite
              </Botao>
            </form>
          )}
        </Cartao>
      </div>
    </main>
  );
}
