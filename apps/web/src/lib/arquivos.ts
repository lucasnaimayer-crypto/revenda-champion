import "server-only";
import type { supabaseServidor } from "./supabase/servidor";

type Cliente = Awaited<ReturnType<typeof supabaseServidor>>;

/** URLs assinadas (1 hora) para fotos do bucket de catálogos, por caminho. */
export async function urlsAssinadas(supabase: Cliente, caminhos: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(caminhos.filter((c): c is string => Boolean(c)))];
  const urls = new Map<string, string>();
  for (let i = 0; i < unicos.length; i += 500) {
    const { data } = await supabase.storage.from("catalogos").createSignedUrls(unicos.slice(i, i + 500), 3600);
    for (const u of data ?? []) if (u.path && u.signedUrl) urls.set(u.path, u.signedUrl);
  }
  return urls;
}
