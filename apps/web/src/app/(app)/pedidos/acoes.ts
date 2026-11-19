"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { valoresDoItem } from "@revenda/regras";
import { carregarRegras, paraCalculo } from "@/lib/regras";
import { exigirDono } from "@/lib/sessao";

export interface Resultado {
  erro?: string;
}

const uuid = z.string().uuid();

function mensagem(erro: { message: string } | null | undefined): string | undefined {
  if (!erro) return undefined;
  if (/não está mais em rascunho/.test(erro.message)) return "Este pedido já foi enviado e não pode mais ser alterado.";
  return erro.message;
}

export async function criarPedidoDoCatalogo(form: FormData) {
  const catalogoId = uuid.parse(form.get("catalogo_id"));
  const { supabase, revendedor } = await exigirDono();
  const { data: catalogo } = await supabase.from("catalogo").select("id, nome").eq("id", catalogoId).maybeSingle();
  if (!catalogo) throw new Error("Catálogo não encontrado.");
  const { data: pedido, error } = await supabase
    .from("pedido")
    .insert({ revendedor_id: revendedor.id, catalogo_id: catalogo.id, nome: catalogo.nome })
    .select("id")
    .single();
  if (error || !pedido) throw new Error(error?.message ?? "Não foi possível criar o pedido.");
  redirect(`/pedidos/${pedido.id}`);
}

/** Define a quantidade de uma peça do catálogo no pedido (0 tira a peça). */
export async function definirQuantidade(pedidoId: string, catalogoPecaId: string, quantidade: number): Promise<Resultado> {
  const dados = z
    .object({ pedidoId: uuid, catalogoPecaId: uuid, quantidade: z.number().int().min(0).max(10000) })
    .safeParse({ pedidoId, catalogoPecaId, quantidade });
  if (!dados.success) return { erro: "Quantidade inválida." };
  const { supabase, revendedor } = await exigirDono();

  if (quantidade === 0) {
    const r = await supabase.from("pedido_item").delete().eq("pedido_id", pedidoId).eq("catalogo_peca_id", catalogoPecaId);
    return { erro: mensagem(r.error) };
  }

  const { data: peca } = await supabase
    .from("catalogo_peca")
    .select("id, codigo, descricao, custo, imagem_path")
    .eq("id", catalogoPecaId)
    .maybeSingle();
  if (!peca) return { erro: "Peça não encontrada." };

  const regras = paraCalculo(await carregarRegras(supabase, revendedor.id));
  const r = await supabase.from("pedido_item").upsert(
    {
      pedido_id: pedidoId,
      revendedor_id: revendedor.id,
      catalogo_peca_id: peca.id,
      codigo: peca.codigo,
      descricao: peca.descricao,
      imagem_path: peca.imagem_path,
      quantidade,
      ...valoresDoItem(peca.custo, regras),
    },
    { onConflict: "pedido_id,codigo" }
  );
  return { erro: mensagem(r.error) };
}

const STATUS = z.enum(["enviado", "confirmado", "rascunho", "cancelado"]);

export async function mudarStatus(pedidoId: string, status: string): Promise<Resultado> {
  const dados = z.object({ pedidoId: uuid, status: STATUS }).safeParse({ pedidoId, status });
  if (!dados.success) return { erro: "Situação inválida." };
  const { supabase } = await exigirDono();
  const { error } = await supabase.rpc("mudar_status_pedido", { p_pedido: pedidoId, p_status: status });
  if (error) return { erro: mensagem(error) };
  revalidatePath(`/pedidos/${pedidoId}`);
  revalidatePath("/pedidos");
  return {};
}

export async function receberPedido(_: Resultado, form: FormData): Promise<Resultado> {
  const pedidoId = uuid.safeParse(form.get("pedido_id"));
  if (!pedidoId.success) return { erro: "Pedido inválido." };
  const recebidos: { item_id: string; quantidade: number }[] = [];
  for (const [chave, valor] of form.entries()) {
    if (!chave.startsWith("recebido:")) continue;
    const quantidade = Number(valor);
    if (!Number.isInteger(quantidade) || quantidade < 0 || quantidade > 10000) return { erro: "Confira as quantidades recebidas." };
    recebidos.push({ item_id: uuid.parse(chave.slice("recebido:".length)), quantidade });
  }
  const { supabase } = await exigirDono();
  const { error } = await supabase.rpc("receber_pedido", { p_pedido: pedidoId.data, p_recebidos: recebidos });
  if (error) return { erro: mensagem(error) };
  revalidatePath("/estoque");
  revalidatePath("/pedidos");
  redirect(`/pedidos/${pedidoId.data}`);
}

export async function excluirPedido(form: FormData) {
  const pedidoId = uuid.parse(form.get("pedido_id"));
  const { supabase } = await exigirDono();
  const { data: pedido } = await supabase.from("pedido").select("status").eq("id", pedidoId).maybeSingle();
  if (!pedido) redirect("/pedidos");
  if (pedido.status !== "rascunho") throw new Error("Só pedidos em rascunho podem ser excluídos.");
  const { error } = await supabase.from("pedido").delete().eq("id", pedidoId);
  if (error) throw new Error(error.message);
  revalidatePath("/pedidos");
  redirect("/pedidos");
}
