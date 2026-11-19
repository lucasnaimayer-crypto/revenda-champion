// Itens de pedido: cópia dos valores no momento do pedido e a planilha para o representante.
import { calcularPeca, type Comissao, type CustoTipo, type RegraPreco } from "./preco";

export interface RegrasCalculo {
  regra: RegraPreco;
  custos: CustoTipo[];
  comissoes: Comissao[];
}

export interface ValoresItem {
  custo: number;
  custo_total: number;
  preco_venda: number;
  lucro: number;
  detalhe: {
    frete: number;
    custos: { nome: string; valor: number }[];
    comissoes: { nome: string; valor: number }[];
    margem_bp: number;
  };
}

/** Valores por unidade gravados no item, para o histórico não mudar quando a regra mudar. */
export function valoresDoItem(custo: number, regras: RegrasCalculo): ValoresItem {
  const r = calcularPeca({ custo, regra: regras.regra, custos: regras.custos, comissoes: regras.comissoes });
  return {
    custo: r.custoPeca,
    custo_total: r.custoTotal,
    preco_venda: r.precoVenda,
    lucro: r.lucro,
    detalhe: { frete: r.frete, custos: r.custos, comissoes: r.comissoes, margem_bp: r.margemBp },
  };
}

export interface LinhaPlanilha {
  codigo: string;
  descricao?: string | null;
  quantidade: number;
  /** Preço unitário do catálogo, em centavos. */
  custo: number;
}

function reais(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

function celula(valor: string): string {
  // Evita que o Excel interprete o texto como fórmula e escapa aspas e separadores.
  const seguro = /^[=+\-@]/.test(valor) ? `'${valor}` : valor;
  return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/**
 * Planilha do pedido em CSV com ponto e vírgula e BOM UTF-8, que o Excel em português abre
 * direto com acentos e colunas certas. Só traz o que o representante precisa: código,
 * quantidade e preço do catálogo. Custos e lucro do revendedor não vão.
 */
export function planilhaPedidoCsv(itens: LinhaPlanilha[], cabecalho: string[] = []): string {
  const linhas: string[][] = [];
  for (const c of cabecalho) linhas.push([c]);
  if (cabecalho.length) linhas.push([]);
  linhas.push(["Código", "Descrição", "Quantidade", "Preço unitário (R$)", "Total (R$)"]);
  let pecas = 0;
  let total = 0;
  for (const i of [...itens].sort((a, b) => a.codigo.localeCompare(b.codigo))) {
    pecas += i.quantidade;
    total += i.custo * i.quantidade;
    linhas.push([i.codigo, i.descricao ?? "", String(i.quantidade), reais(i.custo), reais(i.custo * i.quantidade)]);
  }
  linhas.push(["Total", "", String(pecas), "", reais(total)]);
  return "﻿" + linhas.map((l) => l.map((v) => celula(v)).join(";")).join("\r\n") + "\r\n";
}
