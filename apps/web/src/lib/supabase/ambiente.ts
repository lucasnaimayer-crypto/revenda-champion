// Endereço e chave pública do Supabase. Aceita os nomes que o painel do Supabase e a integração
// da Vercel costumam sugerir, para um nome diferente não derrubar o app.
// As referências precisam ser literais: o Next troca process.env.NEXT_PUBLIC_* no build.
export function lerAmbienteSupabase(): { url: string; chave: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const chave = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  return url && chave ? { url, chave } : null;
}

export function ambienteSupabase(): { url: string; chave: string } {
  const ambiente = lerAmbienteSupabase();
  if (!ambiente) {
    throw new Error(
      "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (veja apps/web/.env.example)."
    );
  }
  return ambiente;
}
