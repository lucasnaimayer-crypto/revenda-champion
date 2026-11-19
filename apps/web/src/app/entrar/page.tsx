import { Cartao } from "@/componentes/ui";
import FormEntrar from "./FormEntrar";

export default async function Entrar({ searchParams }: PageProps<"/entrar">) {
  const { voltar } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Revenda Champion</h1>
          <p className="mt-1 text-sm text-zinc-500">Catálogos, pedidos, estoque e vendas num lugar só.</p>
        </div>
        <Cartao>
          <FormEntrar voltar={typeof voltar === "string" ? voltar : undefined} />
        </Cartao>
      </div>
    </main>
  );
}
