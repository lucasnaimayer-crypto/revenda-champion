import Abas from "@/componentes/configuracoes/Abas";
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
      <Titulo>Configurações</Titulo>
      <Abas atual="/configuracoes" />
      <FormRegras inicial={paraFormulario(regras)} />
    </>
  );
}
