import { redirect } from "next/navigation";
import { Cartao } from "@/componentes/ui";
import { exigirUsuario } from "@/lib/sessao";
import FormCadastro from "./FormCadastro";

export default async function Cadastro() {
  const { supabase, usuarioId } = await exigirUsuario();
  const { data } = await supabase.from("membro").select("id").eq("usuario_id", usuarioId).not("revendedor_id", "is", null).limit(1);
  if (data && data.length > 0) redirect("/painel");
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sua revenda</h1>
          <p className="mt-1 text-sm text-zinc-500">Esses dados aparecem nos pedidos que você envia ao representante.</p>
        </div>
        <Cartao>
          <FormCadastro />
        </Cartao>
      </div>
    </main>
  );
}
