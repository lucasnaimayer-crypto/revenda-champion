import "server-only";
import { redirect } from "next/navigation";
import { supabaseServidor } from "./supabase/servidor";

export type Papel = "dono" | "equipe";

export interface Revendedor {
  id: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  documento: string | null;
  configurado: boolean;
}

/** Usuário logado; manda para /entrar se não houver sessão. */
export async function exigirUsuario() {
  const supabase = await supabaseServidor();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) redirect("/entrar");
  return { supabase, usuarioId: id, email: (data?.claims?.email as string | undefined) ?? null };
}

/**
 * Revendedor do usuário logado. Sem revendedor vai para /cadastro; sem configuração inicial
 * vai para /primeiro-acesso (a menos que a própria página peça para não redirecionar).
 */
export async function exigirRevendedor({ permitirSemConfiguracao = false } = {}) {
  const { supabase, usuarioId, email } = await exigirUsuario();
  const { data: membro, error } = await supabase
    .from("membro")
    .select("papel, revendedor:revendedor_id (id, nome, cidade, uf, telefone, documento, configurado)")
    .eq("usuario_id", usuarioId)
    .not("revendedor_id", "is", null)
    .order("criado_em")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar o revendedor: ${error.message}`);
  const revendedor = (membro?.revendedor ?? null) as Revendedor | null;
  if (!membro || !revendedor) redirect("/cadastro");
  if (!revendedor.configurado && !permitirSemConfiguracao) redirect("/primeiro-acesso");
  return { supabase, usuarioId, email, papel: membro.papel as Papel, revendedor };
}

export async function exigirDono(opcoes?: { permitirSemConfiguracao?: boolean }) {
  const ctx = await exigirRevendedor(opcoes);
  if (ctx.papel !== "dono") redirect("/painel");
  return ctx;
}
