import "server-only";
import type { supabaseServidor } from "./supabase/servidor";

type Cliente = Awaited<ReturnType<typeof supabaseServidor>>;

export interface Rascunho {
  id: string;
  numero: number;
  nome: string;
  pecas: number;
}

/** Pedidos em rascunho do revendedor, do mais novo para o mais antigo. */
export async function carregarRascunhos(supabase: Cliente, revendedorId: string): Promise<Rascunho[]> {
  const { data, error } = await supabase
    .from("pedido")
    .select("id, numero, nome, pedido_item (quantidade)")
    .eq("revendedor_id", revendedorId)
    .eq("status", "rascunho")
    .order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return data.map((p) => ({ id: p.id, numero: p.numero, nome: p.nome, pecas: p.pedido_item.reduce((s, i) => s + i.quantidade, 0) }));
}

/**
 * Qual rascunho recebe as peças: o pedido escolhido na tela, ou o rascunho mais novo.
 * "novo" (ou nenhum rascunho) quer dizer que o pedido só é criado ao tocar na primeira peça.
 */
export function escolherRascunho(rascunhos: Rascunho[], escolhido: string | string[] | undefined): Rascunho | null {
  if (escolhido === "novo") return null;
  return rascunhos.find((r) => r.id === escolhido) ?? rascunhos[0] ?? null;
}
