"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/servidor";

export interface EstadoEntrar {
  /** "codigo": a conta existe e espera o código enviado por e-mail. */
  etapa?: "codigo";
  email?: string;
  erro?: string;
  mensagem?: string;
}

const email = z.string().trim().toLowerCase().email("Informe um e-mail válido.");
const credenciais = z.object({ email, senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.") });
const codigo = z
  .string()
  .transform((s) => s.replace(/\D/g, ""))
  .pipe(z.string().min(6, "O código tem 6 dígitos.").max(10, "Código inválido."));

function destinoSeguro(voltar: FormDataEntryValue | null, padrao = "/painel"): string {
  const v = typeof voltar === "string" ? voltar : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : padrao;
}

function traduzir(m: string): string {
  if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/already registered|already been registered/i.test(m)) return "Já existe uma conta com este e-mail. Use Entrar.";
  if (/expired|invalid/i.test(m) && /otp|token/i.test(m)) return "Código inválido ou vencido. Confira o último e-mail ou peça outro código.";
  if (/rate limit|security purposes|only request this after/i.test(m)) return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  if (/password/i.test(m) && /weak|short|characters/i.test(m)) return "Escolha uma senha mais forte, com pelo menos 8 caracteres.";
  return m;
}

/** Uma ação só para a tela inteira: entrar, criar conta, confirmar o código e reenviar o código. */
export async function acessar(_: EstadoEntrar, form: FormData): Promise<EstadoEntrar> {
  const intencao = String(form.get("intencao") ?? "");
  const supabase = await supabaseServidor();

  if (intencao === "codigo" || intencao === "reenviar") {
    const e = email.safeParse(form.get("email"));
    if (!e.success) return { erro: "Comece de novo informando o seu e-mail." };
    if (intencao === "reenviar") {
      const { error } = await supabase.auth.resend({ type: "signup", email: e.data });
      if (error) return { etapa: "codigo", email: e.data, erro: traduzir(error.message) };
      return { etapa: "codigo", email: e.data, mensagem: `Enviamos um novo código para ${e.data}.` };
    }
    const c = codigo.safeParse(String(form.get("codigo") ?? ""));
    if (!c.success) return { etapa: "codigo", email: e.data, erro: c.error.issues[0]?.message };
    let { error } = await supabase.auth.verifyOtp({ email: e.data, token: c.data, type: "email" });
    if (error) ({ error } = await supabase.auth.verifyOtp({ email: e.data, token: c.data, type: "signup" }));
    if (error) return { etapa: "codigo", email: e.data, erro: traduzir(error.message) };
    redirect(destinoSeguro(form.get("voltar"), "/cadastro"));
  }

  const dados = credenciais.safeParse({ email: form.get("email"), senha: form.get("senha") });
  if (!dados.success) return { erro: dados.error.issues[0]?.message };

  if (intencao === "cadastrar") {
    const { data, error } = await supabase.auth.signUp({ email: dados.data.email, password: dados.data.senha });
    if (error) return { erro: traduzir(error.message) };
    if (data.session) redirect(destinoSeguro(form.get("voltar"), "/cadastro"));
    // E-mail já cadastrado e confirmado: o Supabase não diz, mas também não manda código.
    if (data.user && (data.user.identities?.length ?? 0) === 0) return { erro: "Já existe uma conta com este e-mail. Use Entrar." };
    return { etapa: "codigo", email: dados.data.email, mensagem: `Enviamos um código de confirmação para ${dados.data.email}.` };
  }

  const { error } = await supabase.auth.signInWithPassword({ email: dados.data.email, password: dados.data.senha });
  if (error && /not confirmed/i.test(error.message)) {
    await supabase.auth.resend({ type: "signup", email: dados.data.email });
    return { etapa: "codigo", email: dados.data.email, mensagem: `Falta confirmar o e-mail. Enviamos um código para ${dados.data.email}.` };
  }
  if (error) return { erro: traduzir(error.message) };
  redirect(destinoSeguro(form.get("voltar")));
}

export async function sair() {
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  redirect("/entrar");
}
