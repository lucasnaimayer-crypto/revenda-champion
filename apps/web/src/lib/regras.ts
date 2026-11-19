import "server-only";
import type { Comissao, CustoTipo, RegraPreco } from "@revenda/regras";
import type { supabaseServidor } from "./supabase/servidor";

type Cliente = Awaited<ReturnType<typeof supabaseServidor>>;

export interface RegrasDoRevendedor {
  regra: RegraPreco;
  custos: CustoTipo[];
  comissoes: (Comissao & { id: string; ligadaPorPadrao: boolean })[];
}

export async function carregarRegras(supabase: Cliente, revendedorId: string): Promise<RegrasDoRevendedor> {
  const [regra, custos, comissoes] = await Promise.all([
    supabase.from("regra_preco").select("frete_bp, markup_bp, arredondamento").eq("revendedor_id", revendedorId).maybeSingle(),
    supabase
      .from("custo_tipo")
      .select("id, nome, modo, valor, aplica_a_todos")
      .eq("revendedor_id", revendedorId)
      .eq("ativo", true)
      .order("ordem")
      .order("criado_em"),
    supabase
      .from("regra_comissao")
      .select("id, nome, percentual_bp, ligada_por_padrao")
      .eq("revendedor_id", revendedorId)
      .eq("ativo", true)
      .order("criado_em"),
  ]);
  for (const r of [regra, custos, comissoes]) if (r.error) throw new Error(r.error.message);
  return {
    regra: {
      freteBp: regra.data?.frete_bp ?? 0,
      markupBp: regra.data?.markup_bp ?? 10000,
      arredondamento: (regra.data?.arredondamento ?? "nenhum") as RegraPreco["arredondamento"],
    },
    custos: (custos.data ?? []).map((c) => ({
      id: c.id,
      nome: c.nome,
      modo: c.modo as CustoTipo["modo"],
      valor: c.valor,
      aplicaATodos: c.aplica_a_todos,
    })),
    comissoes: (comissoes.data ?? []).map((c) => ({
      id: c.id,
      nome: c.nome,
      percentualBp: c.percentual_bp,
      ligadaPorPadrao: c.ligada_por_padrao,
    })),
  };
}
