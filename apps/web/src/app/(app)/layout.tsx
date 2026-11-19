import Marca from "@/componentes/Marca";
import Navegacao from "@/componentes/Navegacao";
import { exigirRevendedor } from "@/lib/sessao";
import { sair } from "../entrar/acoes";

export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const { revendedor, papel, email } = await exigirRevendedor();
  return (
    <div className="min-h-screen">
      <header className="bg-tinta text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <Marca claro className="text-sm" />
            <span className="truncate text-sm text-white/60">{revendedor.nome}</span>
          </div>
          <form action={sair} className="flex shrink-0 items-center gap-3 text-sm text-white/60">
            <span className="hidden sm:inline">{email}</span>
            <button type="submit" className="hover:text-white">
              Sair
            </button>
          </form>
        </div>
        <div className="mx-auto max-w-6xl px-2 pb-1 pt-2">
          <Navegacao dono={papel === "dono"} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
