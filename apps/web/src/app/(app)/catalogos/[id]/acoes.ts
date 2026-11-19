"use server";

import { redirect } from "next/navigation";
import { exigirDono } from "@/lib/sessao";

export async function excluirCatalogo(form: FormData) {
  const id = String(form.get("id") ?? "");
  const { supabase, revendedor } = await exigirDono();
  const { data: pecas } = await supabase.from("catalogo_peca").select("imagem_path").eq("catalogo_id", id).eq("revendedor_id", revendedor.id);
  const caminhos = (pecas ?? []).map((p) => p.imagem_path).filter((p): p is string => Boolean(p));
  for (let i = 0; i < caminhos.length; i += 100) await supabase.storage.from("catalogos").remove(caminhos.slice(i, i + 100));
  const { error } = await supabase.from("catalogo").delete().eq("id", id).eq("revendedor_id", revendedor.id);
  if (error) throw new Error(error.message);
  redirect("/catalogos");
}
