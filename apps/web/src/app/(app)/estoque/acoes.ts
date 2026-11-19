"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { lerReais } from "@revenda/regras";
import { exigirDono } from "@/lib/sessao";

export interface Resultado {
  erro?: string;
  ok?: string;
}

const uuid = z.string().uuid();

/** Corrige o estoque para a quantidade contada (lança a diferença como ajuste). */
export async function ajustarEstoque(_: Resultado, form: FormData): Promise<Resultado> {
  const dados = z
    .object({
      produtoId: uuid,
      contado: z.coerce.number().int("Use um número inteiro.").min(0, "A quantidade não pode ser negativa.").max(100000),
      motivo: z.string().trim().min(1, "Informe o motivo do ajuste.").max(200),
    })
    .safeParse({ produtoId: form.get("produto_id"), contado: form.get("contado"), motivo: form.get("motivo") });
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Confira os dados." };
  const { supabase, revendedor, usuarioId } = await exigirDono();
  const { data: s } = await supabase.from("estoque_saldo").select("saldo").eq("produto_id", dados.data.produtoId).maybeSingle();
  const diferenca = dados.data.contado - (s?.saldo ?? 0);
  if (diferenca === 0) return { ok: "O estoque já está com essa quantidade." };
  const { error } = await supabase.from("estoque_movimento").insert({
    revendedor_id: revendedor.id,
    produto_id: dados.data.produtoId,
    tipo: "ajuste",
    quantidade: diferenca,
    origem_tipo: "manual",
    motivo: dados.data.motivo,
    chave_idempotencia: `ajuste:${randomUUID()}`,
    criado_por: usuarioId,
  });
  if (error) return { erro: error.message };
  revalidatePath(`/estoque/${dados.data.produtoId}`);
  revalidatePath("/estoque");
  return { ok: `Estoque ajustado (${diferenca > 0 ? "+" : ""}${diferenca}).` };
}

const EntradaProduto = z.object({
  produtoId: uuid,
  descricao: z.string().trim().max(200).nullable(),
  precoManual: z.number().int().min(0).nullable(),
  custos: z
    .array(z.object({ custoTipoId: uuid, modo: z.enum(["padrao", "nao", "valor"]), valor: z.number().int().min(0).nullable() }))
    .max(50),
});

/** Preço definido à mão e custos próprios do produto. */
export async function salvarProduto(entrada: z.infer<typeof EntradaProduto>): Promise<Resultado> {
  const dados = EntradaProduto.safeParse(entrada);
  if (!dados.success) return { erro: "Confira os valores." };
  const e = dados.data;
  const { supabase, revendedor } = await exigirDono();
  const { error } = await supabase.from("produto").update({ descricao: e.descricao || null, preco_manual: e.precoManual }).eq("id", e.produtoId);
  if (error) return { erro: error.message };

  const remover = e.custos.filter((c) => c.modo === "padrao").map((c) => c.custoTipoId);
  const gravar = e.custos
    .filter((c) => c.modo !== "padrao")
    .map((c) => ({ produto_id: e.produtoId, custo_tipo_id: c.custoTipoId, revendedor_id: revendedor.id, valor: c.modo === "nao" ? null : (c.valor ?? 0) }));
  if (remover.length) {
    const r = await supabase.from("produto_custo").delete().eq("produto_id", e.produtoId).in("custo_tipo_id", remover);
    if (r.error) return { erro: r.error.message };
  }
  if (gravar.length) {
    const r = await supabase.from("produto_custo").upsert(gravar, { onConflict: "produto_id,custo_tipo_id" });
    if (r.error) return { erro: r.error.message };
  }
  revalidatePath(`/estoque/${e.produtoId}`);
  revalidatePath("/estoque");
  return { ok: "Produto salvo." };
}

/** Cadastra um produto que não veio de pedido (estoque antigo, compra avulsa). */
export async function criarProduto(_: Resultado, form: FormData): Promise<Resultado> {
  const custo = lerReais(String(form.get("custo") ?? ""));
  const dados = z
    .object({
      codigo: z.string().trim().toUpperCase().min(1, "Informe o código.").max(40),
      descricao: z.string().trim().max(200),
      quantidade: z.coerce.number().int().min(0).max(100000),
    })
    .safeParse({ codigo: form.get("codigo"), descricao: form.get("descricao") ?? "", quantidade: form.get("quantidade") || 0 });
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Confira os dados." };
  if (custo === null) return { erro: "Informe o custo da peça." };
  const { supabase, revendedor, usuarioId } = await exigirDono();
  const { data: produto, error } = await supabase
    .from("produto")
    .insert({ revendedor_id: revendedor.id, codigo: dados.data.codigo, descricao: dados.data.descricao || null, custo })
    .select("id")
    .single();
  if (error) return { erro: error.code === "23505" ? "Já existe um produto com esse código." : error.message };
  if (dados.data.quantidade > 0) {
    const r = await supabase.from("estoque_movimento").insert({
      revendedor_id: revendedor.id,
      produto_id: produto.id,
      tipo: "ajuste",
      quantidade: dados.data.quantidade,
      custo_unitario: custo,
      origem_tipo: "manual",
      motivo: "Estoque inicial",
      chave_idempotencia: `inicial:${produto.id}`,
      criado_por: usuarioId,
    });
    if (r.error) return { erro: r.error.message };
  }
  revalidatePath("/estoque");
  redirect(`/estoque/${produto.id}`);
}
