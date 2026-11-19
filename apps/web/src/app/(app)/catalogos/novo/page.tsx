import NovoCatalogo from "@/componentes/catalogo/NovoCatalogo";
import { Titulo } from "@/componentes/ui";
import { iaDisponivel } from "@/lib/ia";
import { exigirDono } from "@/lib/sessao";

export default async function NovoCatalogoPagina() {
  const { revendedor } = await exigirDono();
  return (
    <>
      <Titulo>Novo catálogo</Titulo>
      <NovoCatalogo revendedorId={revendedor.id} iaDisponivel={iaDisponivel()} />
    </>
  );
}
