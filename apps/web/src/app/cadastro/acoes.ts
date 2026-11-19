"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirUsuario } from "@/lib/sessao";

export interface EstadoCadastro {
  erro?: string;
}

const esquema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da revenda.").max(120),
  documento: z.string().trim().max(20).optional(),
  cidade: z.string().trim().max(80).optional(),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-Z]{2})?$/, "UF com duas letras, por exemplo SP.")
    .optional(),
  telefone: z.string().trim().max(30).optional(),
});

export async function criarRevendedor(_: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const dados = esquema.safeParse(Object.fromEntries(form));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { supabase } = await exigirUsuario();
  const { error } = await supabase.rpc("criar_revendedor", {
    p_nome: dados.data.nome,
    p_documento: dados.data.documento || null,
    p_cidade: dados.data.cidade || null,
    p_uf: dados.data.uf || null,
    p_telefone: dados.data.telefone || null,
  });
  if (error && !/já tem um revendedor/.test(error.message)) return { erro: error.message };
  redirect("/primeiro-acesso");
}
