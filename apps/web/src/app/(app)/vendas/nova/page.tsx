import NovaVenda from "@/componentes/venda/NovaVenda";
import { Titulo } from "@/componentes/ui";
import { urlsAssinadas } from "@/lib/arquivos";
import { hojeISO } from "@/lib/datas";
import { carregarAjustes, precificar } from "@/lib/produtos";
import { carregarRegras } from "@/lib/regras";
import { exigirDono } from "@/lib/sessao";

export default async function NovaVendaPagina({ searchParams }: PageProps<"/vendas/nova">) {
  const { cliente } = await searchParams;
  const { supabase, revendedor } = await exigirDono();
  const [{ data: produtos, error }, { data: saldos }, { data: clientes }, regras, ajustes] = await Promise.all([
    supabase.from("produto").select("id, codigo, descricao, custo, preco_manual, imagem_path").eq("revendedor_id", revendedor.id).eq("ativo", true).order("codigo"),
    supabase.from("estoque_saldo").select("produto_id, saldo").eq("revendedor_id", revendedor.id).gt("saldo", 0),
    supabase.from("cliente").select("id, nome").eq("revendedor_id", revendedor.id).eq("ativo", true).order("nome"),
    carregarRegras(supabase, revendedor.id),
    carregarAjustes(supabase, revendedor.id),
  ]);
  if (error) throw new Error(error.message);
  const saldo = new Map((saldos ?? []).map((s) => [s.produto_id, s.saldo]));
  const emEstoque = produtos.filter((p) => (saldo.get(p.id) ?? 0) > 0);
  const urls = await urlsAssinadas(supabase, emEstoque.map((p) => p.imagem_path));

  return (
    <>
      <Titulo>Nova venda</Titulo>
      <NovaVenda
        hoje={hojeISO()}
        clienteInicial={typeof cliente === "string" ? cliente : null}
        clientes={clientes ?? []}
        comissoes={regras.comissoes}
        produtos={emEstoque.map((p) => {
          const preco = precificar(p, regras, ajustes.get(p.id));
          return {
            id: p.id,
            codigo: p.codigo,
            descricao: p.descricao,
            url: p.imagem_path ? urls.get(p.imagem_path) ?? null : null,
            saldo: saldo.get(p.id) ?? 0,
            preco: preco.precoVenda,
            custo: preco.custoUnitario,
          };
        })}
      />
    </>
  );
}
