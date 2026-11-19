import { describe, expect, it } from "vitest";
import { planilhaPedidoCsv, valoresDoItem } from "./pedido";

describe("valoresDoItem", () => {
  it("grava custo total, preço, lucro e o detalhe por unidade", () => {
    const v = valoresDoItem(10000, {
      regra: { freteBp: 500, markupBp: 10000, arredondamento: "nenhum" },
      custos: [{ id: "e", nome: "Embalagem", modo: "fixo", valor: 300, aplicaATodos: true }],
      comissoes: [{ nome: "Indicação", percentualBp: 1000 }],
    });
    expect(v).toEqual({
      custo: 10000,
      custo_total: 10800,
      preco_venda: 21600,
      lucro: 21600 - 10800 - 2160,
      detalhe: {
        frete: 500,
        custos: [{ nome: "Embalagem", valor: 300 }],
        comissoes: [{ nome: "Indicação", valor: 2160 }],
        margem_bp: 4000,
      },
    });
  });
});

describe("planilhaPedidoCsv", () => {
  it("gera CSV para o Excel com totais e sem custos do revendedor", () => {
    const csv = planilhaPedidoCsv(
      [
        { codigo: "CN21818T", quantidade: 2, custo: 13990 },
        { codigo: "CH22911P", descricao: 'Relógio "clássico"; prata', quantidade: 3, custo: 12490 },
      ],
      ["Pedido nº 1 - Relógios da Ana"]
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Pedido nº 1 - Relógios da Ana",
      "",
      "Código;Descrição;Quantidade;Preço unitário (R$);Total (R$)",
      'CH22911P;"Relógio ""clássico""; prata";3;124,90;374,70',
      "CN21818T;;2;139,90;279,80",
      "Total;;5;;654,50",
      "",
    ]);
  });

  it("neutraliza texto que o Excel leria como fórmula", () => {
    const csv = planilhaPedidoCsv([{ codigo: "=HYPERLINK(1)", quantidade: 1, custo: 100 }]);
    expect(csv).toContain("'=HYPERLINK(1)");
  });
});

describe("tabelaCsv", () => {
  it("separa por ponto e vírgula, escapa e neutraliza fórmulas", async () => {
    const { tabelaCsv, reaisCsv } = await import("./pedido");
    const csv = tabelaCsv([
      ["Nome", "Valor"],
      ["=HYPERLINK(1)", reaisCsv(12345)],
      ['Ana "A"; B', null],
    ]);
    expect(csv).toBe('﻿Nome;Valor\r\n\'=HYPERLINK(1);123,45\r\n"Ana ""A""; B";\r\n');
  });
});
