"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/servidor";

export interface EstadoEntrar {
  erro?: string;
  mensagem?: string;
}

const credenciais = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});

function destinoSeguro(voltar: FormDataEntryValue | null): string {
  const v = typeof voltar === "string" ? voltar : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/painel";
}

export async function entrar(_: EstadoEntrar, form: FormData): Promise<EstadoEntrar> {
  const dados = credenciais.safeParse({ email: form.get("email"), senha: form.get("senha") });
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: dados.data.email, password: dados.data.senha });
  if (error) return { erro: error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message };
  redirect(destinoSeguro(form.get("voltar")));
}

export async function cadastrar(_: EstadoEntrar, form: FormData): Promise<EstadoEntrar> {
  const dados = credenciais.safeParse({ email: form.get("email"), senha: form.get("senha") });
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const supabase = await supabaseServidor();
  const origem = (await headers()).get("origin") ?? "";
  const { data, error } = await supabase.auth.signUp({
    email: dados.data.email,
    password: dados.data.senha,
    options: { emailRedirectTo: `${origem}/auth/confirmar?voltar=/cadastro` },
  });
  if (error) return { erro: error.message };
  if (data.session) redirect("/cadastro");
  return { mensagem: "Enviamos um link de confirmação para o seu e-mail. Abra o link para continuar." };
}

export async function sair() {
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  redirect("/entrar");
}
