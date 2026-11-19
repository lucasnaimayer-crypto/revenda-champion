"use client";
import { createBrowserClient } from "@supabase/ssr";
import { ambienteSupabase } from "./ambiente";

let cliente: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseNavegador() {
  if (!cliente) {
    const { url, chave } = ambienteSupabase();
    cliente = createBrowserClient(url, chave);
  }
  return cliente;
}
