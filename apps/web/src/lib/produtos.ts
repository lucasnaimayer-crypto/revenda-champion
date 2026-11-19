import "server-only";
import { calcularPeca } from "@revenda/regras";
import type { RegrasDoRevendedor } from "./regras";
import type { supabaseServidor } from "./supabase/servidor";

type Cliente = Awaited<ReturnType<typeof supabaseServidor>>;

export type Ajustes = Record<string, number | null>;

/** Custos próprios de cada produto (produto_custo), por produto e tipo de custo. */
export async function carregarAjustes(supabase: Cliente, revendedorId: string): Promise<Map<string, Ajustes>> {
  const { data, error } = await supabase.from("produto_custo").select("produto_id, custo_tipo_id, valor").eq("revendedor_id", revendedorId);
  if (error) throw new Error(error.message);
  const mapa = new Map<string, Ajustes>();
  for (const a of data ?? []) {
    const atual = mapa.get(a.produto_id) ?? {};
    atual[a.custo_tipo_id] = a.valor;
    mapa.set(a.produto_id, atual);
  }
  return mapa;
}

/** Custo total por unidade e preço de venda atuais de um produto. */
export function precificar(produto: { custo: number; preco_manual: number | null }, regras: RegrasDoRevendedor, ajustes?: Ajustes) {
  const r = calcularPeca({ custo: produto.custo, regra: regras.regra, custos: regras.custos, ajustesDoProduto: ajustes, precoManual: produto.preco_manual });
  return { custoUnitario: r.custoTotal, precoVenda: r.precoVenda, frete: r.frete, custos: r.custos };
}
