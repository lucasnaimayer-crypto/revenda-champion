import { NextResponse, type NextRequest } from "next/server";
import { planilhaPedidoCsv } from "@revenda/regras";
import { exigirDono } from "@/lib/sessao";

export async function GET(_: NextRequest, { params }: RouteContext<"/pedidos/[id]/planilha">) {
  const { id } = await params;
  const { supabase, revendedor } = await exigirDono();
  const { data: pedido } = await supabase.from("pedido").select("numero, nome, enviado_em, criado_em").eq("id", id).maybeSingle();
  if (!pedido) return new NextResponse("Pedido não encontrado.", { status: 404 });
  const { data: itens, error } = await supabase.from("pedido_item").select("codigo, descricao, quantidade, custo").eq("pedido_id", id);
  if (error) return new NextResponse(error.message, { status: 500 });
  const data = new Date(pedido.enviado_em ?? pedido.criado_em).toLocaleDateString("pt-BR");
  const csv = planilhaPedidoCsv(itens, [
    `Pedido nº ${pedido.numero} - ${pedido.nome}`,
    `${revendedor.nome}${revendedor.telefone ? ` - ${revendedor.telefone}` : ""}`,
    `Data: ${data}`,
  ]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pedido-${pedido.numero}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
