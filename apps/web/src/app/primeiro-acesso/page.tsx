import { redirect } from "next/navigation";
import FormRegras from "@/componentes/regras/FormRegras";
import { carregarRegras } from "@/lib/regras";
import { paraFormulario } from "@/lib/regras-iniciais";
import { exigirDono } from "@/lib/sessao";

export default async function PrimeiroAcesso() {
  const { supabase, revendedor } = await exigirDono({ permitirSemConfiguracao: true });
  if (revendedor.configurado) redirect("/painel");
  const regras = await carregarRegras(supabase, revendedor.id);
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-sm font-medium text-zinc-500">Primeiro acesso</p>
      <h1 className="text-2xl font-semibold tracking-tight">Como você calcula o preço das suas peças?</h1>
      <p className="mb-8 mt-1 max-w-2xl text-sm text-zinc-500">
        Essas regras valem para todas as peças que entrarem pelos catálogos. Você pode mudar quando quiser em Configurações, e ajustar
        custos de um produto específico depois.
      </p>
      <FormRegras inicial={paraFormulario(regras)} destino="/catalogos/novo" />
    </main>
  );
}
