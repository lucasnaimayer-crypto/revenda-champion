import { notFound, redirect } from "next/navigation";
import { Titulo } from "@/componentes/ui";
import { urlsAssinadas } from "@/lib/arquivos";
import { exigirDono } from "@/lib/sessao";
import FormReceber from "./FormReceber";

export default async function Receber({ params }: PageProps<"/pedidos/[id]/receber">) {
  const { id } = await params;
  const { supabase } = await exigirDono();
  const { data: pedido } = await supabase.from("pedido").select("id, numero, nome, status").eq("id", id).maybeSingle();
  if (!pedido) notFound();
  if (pedido.status !== "enviado" && pedido.status !== "confirmado") redirect(`/pedidos/${id}`);
  const { data: itens } = await supabase.from("pedido_item").select("id, codigo, quantidade, imagem_path").eq("pedido_id", id).order("codigo");
  const urls = await urlsAssinadas(supabase, (itens ?? []).map((i) => i.imagem_path));
  return (
    <>
      <Titulo>
        Receber pedido nº {pedido.numero} · {pedido.nome}
      </Titulo>
      <p className="mb-4 max-w-2xl text-sm text-zinc-500">
        Confira o que chegou. Se faltou alguma peça, ajuste a quantidade. As peças entram no estoque com o custo do pedido e as
        que ainda não existiam viram produtos novos.
      </p>
      <FormReceber
        pedidoId={pedido.id}
        itens={(itens ?? []).map((i) => ({ id: i.id, codigo: i.codigo, quantidade: i.quantidade, url: i.imagem_path ? urls.get(i.imagem_path) ?? null : null }))}
      />
    </>
  );
}
