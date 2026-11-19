import Navegacao from "@/componentes/Navegacao";
import { exigirRevendedor } from "@/lib/sessao";
import { sair } from "../entrar/acoes";

export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const { revendedor, papel, email } = await exigirRevendedor();
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold">{revendedor.nome}</span>
            <Navegacao dono={papel === "dono"} />
          </div>
          <form action={sair} className="flex items-center gap-3 text-sm text-zinc-500">
            <span className="hidden sm:inline">{email}</span>
            <button type="submit" className="hover:text-zinc-900">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
