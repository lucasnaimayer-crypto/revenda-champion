"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { calcularVenda, FORMAS_PAGAMENTO, parcelar } from "@revenda/regras";
import { carregarAjustes, precificar } from "@/lib/produtos";
import { carregarRegras } from "@/lib/regras";
import { exigirDono } from "@/lib/sessao";

export interface Resultado {
  erro?: string;
  id?: string;
  aviso?: string;
}

const uuid = z.string().uuid();
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

/** Mensagem do banco em frase legível. */
function mensagem(erro: { message: string }): string {
  const m = erro.message.trim();
  return m.charAt(0).toUpperCase() + m.slice(1) + (m.endsWith(".") ? "" : ".");
}

function revalidarVendas(id?: string) {
  revalidatePath("/vendas");
  revalidatePath("/vendas/receber");
  revalidatePath("/estoque");
  revalidatePath("/clientes");
  if (id) revalidatePath(`/vendas/${id}`);
}

const EntradaVenda = z.object({
  chave: uuid,
  data,
  clienteId: uuid.nullable(),
  clienteNovo: z.string().trim().max(120).nullable(),
  formaPagamento: z.enum(FORMAS_PAGAMENTO.map((f) => f.valor) as [string, ...string[]]),
  itens: z.array(z.object({ produtoId: uuid, quantidade: z.number().int().min(1).max(10000) })).min(1, "Adicione ao menos uma peça.").max(500),
  desconto: z.number().int().min(0),
  comissoes: z.array(uuid).max(20),
  aVista: z.boolean(),
  entrada: z.number().int().min(0),
  parcelas: z.number().int().min(0).max(24),
  primeiroVencimento: data.nullable(),
  observacao: z.string().trim().max(500).nullable(),
});

export type EntradaVenda = z.infer<typeof EntradaVenda>;

/**
 * Registra a venda. Preço, custo e comissões são recalculados aqui a partir do banco: o
 * navegador só manda quais peças, quantas e as escolhas de pagamento.
 */
export async function registrarVenda(entrada: EntradaVenda): Promise<Resultado> {
  const dados = EntradaVenda.safeParse(entrada);
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Confira os dados da venda." };
  const e = dados.data;
  const { supabase, revendedor } = await exigirDono();

  const ids = e.itens.map((i) => i.produtoId);
  const [{ data: produtos, error }, regras, ajustes] = await Promise.all([
    supabase.from("produto").select("id, custo, preco_manual").eq("revendedor_id", revendedor.id).in("id", ids),
    carregarRegras(supabase, revendedor.id),
    carregarAjustes(supabase, revendedor.id),
  ]);
  if (error) return { erro: error.message };
  const porId = new Map(produtos.map((p) => [p.id, p]));

  let calculo;
  let recebimentos;
  try {
    const linhas = e.itens.map((i) => {
      const p = porId.get(i.produtoId);
      if (!p) throw new Error("Uma das peças não foi encontrada.");
      const preco = precificar(p, regras, ajustes.get(p.id));
      return { produtoId: p.id, quantidade: i.quantidade, precoUnitario: preco.precoVenda, custoUnitario: preco.custoUnitario };
    });
    const comissoes = regras.comissoes.filter((c) => e.comissoes.includes(c.id)).map((c) => ({ nome: c.nome, percentualBp: c.percentualBp }));
    calculo = calcularVenda({ linhas, desconto: e.desconto, comissoes });
    recebimentos = e.aVista
      ? calculo.totalLiquido > 0
        ? [{ valor: calculo.totalLiquido, vencimento: e.data, recebido: true }]
        : []
      : parcelar({
          total: calculo.totalLiquido,
          dataVenda: e.data,
          entrada: e.entrada,
          parcelas: e.parcelas,
          primeiroVencimento: e.primeiroVencimento ?? undefined,
        });
  } catch (err) {
    return { erro: err instanceof Error ? err.message : String(err) };
  }

  let clienteId = e.clienteId;
  if (!clienteId && e.clienteNovo) {
    const { data: novo, error: erroCliente } = await supabase.from("cliente").insert({ revendedor_id: revendedor.id, nome: e.clienteNovo }).select("id").single();
    if (erroCliente) return { erro: `Não foi possível cadastrar o cliente: ${erroCliente.message}` };
    clienteId = novo.id;
  }

  const { data: id, error: erroVenda } = await supabase.rpc("registrar_venda", {
    p_revendedor: revendedor.id,
    p_dados: {
      chave: e.chave,
      data: e.data,
      forma_pagamento: e.formaPagamento,
      cliente_id: clienteId,
      observacao: e.observacao,
      comissoes: calculo.comissoes.map((c) => ({ nome: c.nome, percentual_bp: c.percentualBp, valor: c.valor })),
      itens: calculo.itens.map((i) => ({
        produto_id: i.produtoId,
        quantidade: i.quantidade,
        preco_unitario: i.precoUnitario,
        desconto_rateado: i.descontoRateado,
        custo_unitario: i.custoUnitario,
        comissao: i.comissao,
      })),
      recebimentos,
    },
  });
  if (erroVenda) return { erro: mensagem(erroVenda) };
  revalidarVendas();
  return { id: id as string };
}

export async function marcarRecebimento(recebimentoId: string, recebidoEm: string | null): Promise<Resultado> {
  const dados = z.object({ id: uuid, em: data.nullable() }).safeParse({ id: recebimentoId, em: recebidoEm });
  if (!dados.success) return { erro: "Parcela inválida." };
  const { supabase } = await exigirDono();
  const { data: rec } = await supabase.from("recebimento").select("venda_id").eq("id", recebimentoId).maybeSingle();
  const { error } = await supabase.rpc("marcar_recebimento", { p_recebimento: recebimentoId, p_recebido_em: recebidoEm });
  if (error) return { erro: mensagem(error) };
  revalidarVendas(rec?.venda_id);
  return {};
}

export async function cancelarVenda(vendaId: string, motivo: string, reverterComissoes: boolean): Promise<Resultado> {
  const dados = z.object({ id: uuid, motivo: z.string().trim().min(1, "Informe o motivo.").max(200) }).safeParse({ id: vendaId, motivo });
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Confira os dados." };
  const { supabase } = await exigirDono();
  const { data: r, error } = await supabase.rpc("cancelar_venda", { p_venda: vendaId, p_motivo: dados.data.motivo, p_reverter_comissoes: reverterComissoes });
  if (error) return { erro: mensagem(error) };
  revalidarVendas(vendaId);
  const reembolso = (r as { reembolso?: number } | null)?.reembolso ?? 0;
  return { aviso: reembolso > 0 ? `reembolso:${reembolso}` : undefined };
}

export async function devolverVenda(
  vendaId: string,
  itens: { itemId: string; quantidade: number }[],
  motivo: string,
  dataDevolucao: string,
  reverterComissoes: boolean
): Promise<Resultado> {
  const dados = z
    .object({
      id: uuid,
      itens: z.array(z.object({ itemId: uuid, quantidade: z.number().int().min(0).max(10000) })).max(500),
      motivo: z.string().trim().min(1, "Informe o motivo.").max(200),
      data,
    })
    .safeParse({ id: vendaId, itens, motivo, data: dataDevolucao });
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Confira os dados." };
  const escolhidos = dados.data.itens.filter((i) => i.quantidade > 0);
  if (escolhidos.length === 0) return { erro: "Escolha ao menos uma peça para devolver." };
  const { supabase } = await exigirDono();
  const { data: r, error } = await supabase.rpc("devolver_venda", {
    p_venda: vendaId,
    p_itens: escolhidos.map((i) => ({ item_id: i.itemId, quantidade: i.quantidade })),
    p_motivo: dados.data.motivo,
    p_data: dados.data.data,
    p_reverter_comissoes: reverterComissoes,
  });
  if (error) return { erro: mensagem(error) };
  revalidarVendas(vendaId);
  const reembolso = (r as { reembolso?: number } | null)?.reembolso ?? 0;
  return { aviso: reembolso > 0 ? `reembolso:${reembolso}` : undefined };
}
