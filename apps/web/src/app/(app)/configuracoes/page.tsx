import FormRegras from "@/componentes/regras/FormRegras";
import { Titulo } from "@/componentes/ui";
import { carregarRegras } from "@/lib/regras";
import { paraFormulario } from "@/lib/regras-iniciais";
import { exigirDono } from "@/lib/sessao";

export default async function Configuracoes() {
  const { supabase, revendedor } = await exigirDono();
  const regras = await carregarRegras(supabase, revendedor.id);
  return (
    <>
      <Titulo>Regras de preço e custos</Titulo>
      <FormRegras inicial={paraFormulario(regras)} />
    </>
  );
}
