"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirDono } from "@/lib/sessao";

export interface EstadoRegras {
  erro?: string;
  ok?: boolean;
}

const inteiro = z.coerce.number().int().min(0);

const esquema = z.object({
  freteBp: inteiro.max(100000),
  markupBp: inteiro.max(100000),
  arredondamento: z.enum(["nenhum", "inteiro", "final_90"]),
  custos: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        nome: z.string().trim().min(1, "Dê um nome a cada custo.").max(60),
        modo: z.enum(["fixo", "percentual"]),
        valor: inteiro.max(100000000),
        aplicaATodos: z.boolean(),
      })
    )
    .max(30),
  comissoes: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        nome: z.string().trim().min(1, "Dê um nome a cada comissão.").max(60),
        percentualBp: inteiro.max(10000),
        ligadaPorPadrao: z.boolean(),
      })
    )
    .max(10),
});

export type DadosRegras = z.infer<typeof esquema>;

function repetido(nomes: string[]): string | undefined {
  const vistos = new Set<string>();
  for (const n of nomes.map((x) => x.trim().toLowerCase())) {
    if (vistos.has(n)) return n;
    vistos.add(n);
  }
}

// Salva regra de preço, custos e comissões do revendedor (só o dono) e marca o primeiro acesso como feito.
export async function salvarRegras(_: EstadoRegras, form: FormData): Promise<EstadoRegras> {
  let bruto: unknown;
  try {
    bruto = JSON.parse(String(form.get("dados") ?? "{}"));
  } catch {
    return { erro: "Dados inválidos." };
  }
  const dados = esquema.safeParse(bruto);
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Dados inválidos." };
  const d = dados.data;
  const nomeRepetido = repetido(d.custos.map((c) => c.nome)) ?? repetido(d.comissoes.map((c) => c.nome));
  if (nomeRepetido) return { erro: `O nome "${nomeRepetido}" aparece duas vezes.` };

  const { supabase, revendedor } = await exigirDono({ permitirSemConfiguracao: true });
  const rev = revendedor.id;

  const regra = await supabase
    .from("regra_preco")
    .upsert({ revendedor_id: rev, frete_bp: d.freteBp, markup_bp: d.markupBp, arredondamento: d.arredondamento, atualizado_em: new Date().toISOString() });
  if (regra.error) return { erro: regra.error.message };

  const sincronizar = async (
    tabela: "custo_tipo" | "regra_comissao",
    linhas: Record<string, unknown>[]
  ): Promise<string | undefined> => {
    const atuais = await supabase.from(tabela).select("id").eq("revendedor_id", rev);
    if (atuais.error) return atuais.error.message;
    const manter = new Set(linhas.map((l) => l.id).filter(Boolean));
    const remover = (atuais.data ?? []).map((a) => a.id).filter((id) => !manter.has(id));
    if (remover.length) {
      const r = await supabase.from(tabela).delete().in("id", remover);
      if (r.error) return r.error.message;
    }
    for (const linha of linhas) {
      const { id, ...resto } = linha;
      const r = id
        ? await supabase.from(tabela).update(resto).eq("id", id as string).eq("revendedor_id", rev)
        : await supabase.from(tabela).insert({ ...resto, revendedor_id: rev });
      if (r.error) return r.error.message.includes("duplicate") ? "Já existe um item com esse nome." : r.error.message;
    }
  };

  const erroCustos = await sincronizar(
    "custo_tipo",
    d.custos.map((c, i) => ({ id: c.id, nome: c.nome, modo: c.modo, valor: c.valor, aplica_a_todos: c.aplicaATodos, ordem: i }))
  );
  if (erroCustos) return { erro: erroCustos };
  const erroComissoes = await sincronizar(
    "regra_comissao",
    d.comissoes.map((c) => ({ id: c.id, nome: c.nome, percentual_bp: c.percentualBp, ligada_por_padrao: c.ligadaPorPadrao }))
  );
  if (erroComissoes) return { erro: erroComissoes };

  if (!revendedor.configurado) {
    const r = await supabase.from("revendedor").update({ configurado: true }).eq("id", rev);
    if (r.error) return { erro: r.error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
