import { NextResponse } from "next/server";
import { z } from "zod";
import { ErroLeitura, iaDisponivel, lerImagemCatalogo, limiteDiarioIa } from "@/lib/ia";
import { exigirDono } from "@/lib/sessao";

export const maxDuration = 120;

// Base64 de até ~3 MB de imagem (o navegador já reduz para no máximo 1600 px).
const Entrada = z.object({
  imagem: z.string().min(100).max(4_000_000).regex(/^[A-Za-z0-9+/=]+$/),
  tipo: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export async function POST(req: Request) {
  if (!iaDisponivel()) return NextResponse.json({ erro: "A leitura por IA não está configurada." }, { status: 404 });
  const { supabase, revendedor } = await exigirDono();
  const dados = Entrada.safeParse(await req.json().catch(() => null));
  if (!dados.success) return NextResponse.json({ erro: "Imagem inválida ou grande demais." }, { status: 400 });

  // Registra antes de chamar a IA: o limite vale mesmo se a leitura falhar no meio.
  const { error } = await supabase.rpc("registrar_leitura_ia", { p_revendedor: revendedor.id, p_limite: limiteDiarioIa() });
  if (error) {
    const m = error.message.trim();
    return NextResponse.json({ erro: m.charAt(0).toUpperCase() + m.slice(1) + "." }, { status: 429 });
  }

  try {
    return NextResponse.json(await lerImagemCatalogo(dados.data.imagem, dados.data.tipo));
  } catch (e) {
    if (e instanceof ErroLeitura) return NextResponse.json({ erro: e.message }, { status: 502 });
    console.error("leitura por IA", e);
    return NextResponse.json({ erro: "A leitura por IA falhou. Tente de novo em instantes." }, { status: 500 });
  }
}
