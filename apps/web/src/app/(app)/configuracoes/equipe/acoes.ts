"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirDono } from "@/lib/sessao";

export interface Resultado {
  erro?: string;
  ok?: string;
}

export async function convidar(_: Resultado, form: FormData): Promise<Resultado> {
  const email = z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(120).safeParse(form.get("email"));
  if (!email.success) return { erro: email.error.issues[0]?.message };
  const { supabase, revendedor, usuarioId, email: meuEmail } = await exigirDono();
  if (meuEmail && email.data === meuEmail.toLowerCase()) return { erro: "Esse é o seu próprio e-mail." };
  const { error } = await supabase.from("convite").insert({ revendedor_id: revendedor.id, email: email.data, criado_por: usuarioId });
  if (error) return { erro: error.message };
  revalidatePath("/configuracoes/equipe");
  return { ok: "Convite criado. Copie o link abaixo e mande para a pessoa." };
}

export async function cancelarConvite(form: FormData) {
  const id = z.string().uuid().parse(form.get("id"));
  const { supabase } = await exigirDono();
  const { error } = await supabase.from("convite").update({ cancelado_em: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/configuracoes/equipe");
}

export async function removerMembro(form: FormData) {
  const id = z.string().uuid().parse(form.get("id"));
  const { supabase } = await exigirDono();
  const { error } = await supabase.from("membro").delete().eq("id", id).eq("papel", "equipe");
  if (error) throw new Error(error.message);
  revalidatePath("/configuracoes/equipe");
}
