import Marca from "@/componentes/Marca";
import { Cartao } from "@/componentes/ui";
import FormEntrar from "./FormEntrar";

export default async function Entrar({ searchParams }: PageProps<"/entrar">) {
  const { voltar } = await searchParams;
  return (
    <main className="flex min-h-screen flex-col">
      <div className="bg-tinta px-4 py-5 text-center">
        <Marca claro className="text-base" />
      </div>
      <div className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Sua revenda Champion organizada</h1>
            <p className="mt-1 text-sm text-zinc-500">Catálogos, pedidos, estoque e vendas num lugar só.</p>
          </div>
          <Cartao>
            <FormEntrar voltar={typeof voltar === "string" ? voltar : undefined} />
          </Cartao>
        </div>
      </div>
    </main>
  );
}
