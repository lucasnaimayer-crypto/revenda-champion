import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/supabase/servidor";

// Link de confirmação de e-mail do Supabase: troca o código por uma sessão.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const codigo = searchParams.get("code");
  const voltar = searchParams.get("voltar") ?? "/painel";
  const destino = voltar.startsWith("/") && !voltar.startsWith("//") ? voltar : "/painel";
  if (codigo) {
    const supabase = await supabaseServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) return NextResponse.redirect(`${origin}${destino}`);
  }
  return NextResponse.redirect(`${origin}/entrar`);
}
