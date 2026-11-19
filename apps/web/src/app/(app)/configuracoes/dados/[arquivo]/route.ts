import { NextResponse, type NextRequest } from "next/server";
import { reaisCsv, rotuloFormaPagamento, tabelaCsv } from "@revenda/regras";
import { carregarAjustes, precificar } from "@/lib/produtos";
import { carregarRegras } from "@/lib/regras";
import { exigirDono } from "@/lib/sessao";

// Exportação dos dados do revendedor (LGPD): clientes, vendas, parcelas e estoque em CSV.
export async function GET(_: NextRequest, { params }: RouteContext<"/configuracoes/dados/[arquivo]">) {
  const { arquivo } = await params;
  const { supabase, revendedor } = await exigirDono();
  let linhas: (string | number | null)[][];

  if (arquivo === "clientes.csv") {
    const { data, error } = await supabase.from("cliente").select("nome, telefone, email, documento, cidade, aniversario, observacao, ativo, criado_em").eq("revendedor_id", revendedor.id).order("nome");
    if (error) return new NextResponse(error.message, { status: 500 });
    linhas = [
      ["Nome", "Telefone", "E-mail", "CPF", "Cidade", "Aniversário", "Observação", "Ativo", "Cadastrado em"],
      ...data.map((c) => [c.nome, c.telefone, c.email, c.documento, c.cidade, c.aniversario, c.observacao, c.ativo ? "sim" : "não", c.criado_em.slice(0, 10)]),
    ];
  } else if (arquivo === "vendas.csv") {
    const { data, error } = await supabase
      .from("venda_item")
      .select("codigo, descricao, quantidade, quantidade_devolvida, preco_unitario, subtotal, desconto_rateado, custo_total, comissao, venda!inner (numero, data, status, forma_pagamento, cliente:cliente_id (nome))")
      .eq("revendedor_id", revendedor.id)
      .order("codigo");
    if (error) return new NextResponse(error.message, { status: 500 });
    type Venda = { numero: number; data: string; status: string; forma_pagamento: string; cliente: { nome: string } | null };
    const ordenado = [...data].sort((a, b) => (a.venda as unknown as Venda).numero - (b.venda as unknown as Venda).numero);
    linhas = [
      ["Venda", "Data", "Situação", "Cliente", "Pagamento", "Código", "Descrição", "Quantidade", "Devolvidas", "Preço un. (R$)", "Subtotal (R$)", "Desconto (R$)", "Custo (R$)", "Comissão (R$)"],
      ...ordenado.map((i) => {
        const v = i.venda as unknown as Venda;
        return [v.numero, v.data, v.status, v.cliente?.nome ?? "", rotuloFormaPagamento(v.forma_pagamento), i.codigo, i.descricao, i.quantidade, i.quantidade_devolvida, reaisCsv(i.preco_unitario), reaisCsv(i.subtotal), reaisCsv(i.desconto_rateado), reaisCsv(i.custo_total), reaisCsv(i.comissao)];
      }),
    ];
  } else if (arquivo === "parcelas.csv") {
    const { data, error } = await supabase
      .from("recebimento")
      .select("parcela, valor, vencimento, status, recebido_em, venda:venda_id (numero, cliente:cliente_id (nome))")
      .eq("revendedor_id", revendedor.id)
      .order("vencimento");
    if (error) return new NextResponse(error.message, { status: 500 });
    type Venda = { numero: number; cliente: { nome: string } | null };
    linhas = [
      ["Venda", "Cliente", "Parcela", "Valor (R$)", "Vencimento", "Situação", "Recebida em"],
      ...data.map((r) => {
        const v = r.venda as unknown as Venda | null;
        return [v?.numero ?? "", v?.cliente?.nome ?? "", r.parcela, reaisCsv(r.valor), r.vencimento, r.status, r.recebido_em];
      }),
    ];
  } else if (arquivo === "estoque.csv") {
    const [{ data: produtos, error }, { data: saldos }, regras, ajustes] = await Promise.all([
      supabase.from("produto").select("id, codigo, descricao, custo, preco_manual, ativo").eq("revendedor_id", revendedor.id).order("codigo"),
      supabase.from("estoque_saldo").select("produto_id, saldo").eq("revendedor_id", revendedor.id),
      carregarRegras(supabase, revendedor.id),
      carregarAjustes(supabase, revendedor.id),
    ]);
    if (error) return new NextResponse(error.message, { status: 500 });
    const saldo = new Map((saldos ?? []).map((s) => [s.produto_id, s.saldo]));
    linhas = [
      ["Código", "Descrição", "Em estoque", "Custo da peça (R$)", "Custo total un. (R$)", "Preço de venda (R$)", "Ativo"],
      ...produtos.map((p) => {
        const preco = precificar(p, regras, ajustes.get(p.id));
        return [p.codigo, p.descricao, saldo.get(p.id) ?? 0, reaisCsv(p.custo), reaisCsv(preco.custoUnitario), reaisCsv(preco.precoVenda), p.ativo ? "sim" : "não"];
      }),
    ];
  } else {
    return new NextResponse("Arquivo não encontrado.", { status: 404 });
  }

  return new NextResponse(tabelaCsv(linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
