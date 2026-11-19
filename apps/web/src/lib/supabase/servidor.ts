import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ambienteSupabase } from "./ambiente";

// Cliente do Supabase para Server Components, Server Actions e Route Handlers.
// Usa a sessão do usuário (cookies), então toda consulta passa pelas regras de acesso do banco.
export async function supabaseServidor() {
  const { url, chave } = ambienteSupabase();
  const loja = await cookies();
  return createServerClient(url, chave, {
    cookies: {
      getAll: () => loja.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) loja.set(name, value, options);
        } catch {
          // Em Server Components não dá para gravar cookies; o proxy renova a sessão.
        }
      },
    },
  });
}
