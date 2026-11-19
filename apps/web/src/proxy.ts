import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { lerAmbienteSupabase } from "@/lib/supabase/ambiente";

const PUBLICAS = ["/entrar", "/auth"];

// Renova a sessão do Supabase a cada requisição e manda para /entrar quem não está logado.
// A autorização de verdade fica no banco (RLS); aqui é só o redirecionamento.
export async function proxy(request: NextRequest) {
  const ambiente = lerAmbienteSupabase();
  if (!ambiente) return NextResponse.next();
  const { url, chave } = ambiente;

  let resposta = NextResponse.next({ request });
  const supabase = createServerClient(url, chave, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) request.cookies.set(name, value);
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of lista) resposta.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const logado = Boolean(data?.claims?.sub);
  const caminho = request.nextUrl.pathname;
  const publica = PUBLICAS.some((p) => caminho === p || caminho.startsWith(`${p}/`));

  if (!logado && !publica) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/entrar";
    destino.search = caminho === "/" ? "" : `?voltar=${encodeURIComponent(caminho)}`;
    return NextResponse.redirect(destino);
  }
  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|webmanifest)$).*)"],
};
