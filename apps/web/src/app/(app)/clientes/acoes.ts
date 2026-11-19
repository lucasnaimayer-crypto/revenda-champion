"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirDono, exigirRevendedor } from "@/lib/sessao";

export interface Resultado {
  erro?: string;
  ok?: boolean;
}

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable();

const DadosCliente = z.object({
  nome: z.string().trim().min(1, "Informe o nome.").max(120),
  telefone: opcional(30),
  email: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-mail inválido."),
  documento: opcional(20),
  cidade: opcional(80),
  aniversario: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida."),
  observacao: opcional(1000),
});

function ler(form: FormData) {
  const campo = (n: string) => (form.get(n) as string | null) ?? "";
  return DadosCliente.safeParse({
    nome: campo("nome"),
    telefone: campo("telefone"),
    email: campo("email"),
    documento: campo("documento"),
    cidade: campo("cidade"),
    aniversario: campo("aniversario"),
    observacao: campo("observacao"),
  });
}

/** Cria (sem id) ou atualiza um cliente. Dono e equipe podem. */
export async function salvarCliente(_: Resultado, form: FormData): Promise<Resultado> {
  const dados = ler(form);
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Confira os dados." };
  const id = z.string().uuid().safeParse(form.get("id"));
  const { supabase, revendedor } = await exigirRevendedor();
  if (id.success) {
    const { error } = await supabase.from("cliente").update(dados.data).eq("id", id.data);
    if (error) return { erro: error.message };
    revalidatePath(`/clientes/${id.data}`);
    revalidatePath("/clientes");
    return { ok: true };
  }
  const { data, error } = await supabase.from("cliente").insert({ ...dados.data, revendedor_id: revendedor.id }).select("id").single();
  if (error) return { erro: error.message };
  revalidatePath("/clientes");
  redirect(`/clientes/${data.id}`);
}

/** Tira o cliente da lista sem apagar o histórico de vendas. */
export async function arquivarCliente(form: FormData) {
  const id = z.string().uuid().parse(form.get("id"));
  const ativo = form.get("ativo") === "sim";
  const { supabase } = await exigirDono();
  const { error } = await supabase.from("cliente").update({ ativo }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
}
