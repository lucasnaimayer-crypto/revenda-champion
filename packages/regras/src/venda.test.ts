import { describe, expect, it } from "vitest";
import { calcularDevolucaoItem, calcularVenda, parcelar, ratear, resultadoDaVenda } from "./venda";

describe("ratear", () => {
  it("distribui sem perder centavos", () => {
    expect(ratear(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(ratear(1000, [27058, 13529])).toEqual([667, 333]);
    expect(ratear(0, [5, 5])).toEqual([0, 0]);
    expect(ratear(7, [0, 0])).toEqual([0, 0]);
  });
});

describe("calcularVenda", () => {
  const linhas = [
    { produtoId: "a", quantidade: 2, precoUnitario: 27058, custoUnitario: 13529 },
    { produtoId: "b", quantidade: 1, precoUnitario: 19990, custoUnitario: 9000 },
  ];

  it("calcula totais, desconto rateado, comissões sobre a tabela e lucro", () => {
    const v = calcularVenda({ linhas, desconto: 4106, comissoes: [{ nome: "Queiroz", percentualBp: 1000 }] });
    expect(v.totalBruto).toBe(74106);
    expect(v.totalLiquido).toBe(70000);
    expect(v.itens.map((i) => i.descontoRateado)).toEqual([2998, 1108]);
    expect(v.itens.reduce((s, i) => s + i.descontoRateado, 0)).toBe(4106);
    expect(v.custoTotal).toBe(36058);
    // 10% de 54116 + 10% de 19990
    expect(v.comissoes).toEqual([{ nome: "Queiroz", percentualBp: 1000, valor: 5412 + 1999 }]);
    expect(v.lucro).toBe(70000 - 36058 - 7411);
    expect(v.pecas).toBe(3);
  });

  it("bate com o SEVENIA: peça de R$ 124,90 vendida por R$ 270,58 com as duas comissões", () => {
    const v = calcularVenda({
      linhas: [{ produtoId: "x", quantidade: 1, precoUnitario: 27058, custoUnitario: 13529 }],
      comissoes: [
        { nome: "Queiroz", percentualBp: 1000 },
        { nome: "Indicação", percentualBp: 1000 },
      ],
    });
    expect(v.comissaoTotal).toBe(2706 * 2);
    expect(v.lucro).toBe(27058 - 13529 - 5412);
  });

  it("recusa entradas inválidas", () => {
    expect(() => calcularVenda({ linhas: [] })).toThrow(/ao menos uma/);
    expect(() => calcularVenda({ linhas, desconto: 999999 })).toThrow(/desconto/);
    expect(() => calcularVenda({ linhas: [linhas[0], linhas[0]] })).toThrow(/duas vezes/);
    expect(() => calcularVenda({ linhas: [{ ...linhas[0], quantidade: 0 }] })).toThrow(/quantidade/);
  });
});

describe("parcelar", () => {
  it("à vista recebido", () => {
    expect(parcelar({ total: 5000, dataVenda: "2026-11-19", entrada: 5000 })).toEqual([{ valor: 5000, vencimento: "2026-11-19", recebido: true }]);
  });

  it("entrada e três parcelas mensais, mantendo o dia e somando o total", () => {
    const p = parcelar({ total: 10000, dataVenda: "2026-01-31", entrada: 1000, parcelas: 3 });
    expect(p).toEqual([
      { valor: 1000, vencimento: "2026-01-31", recebido: true },
      { valor: 3000, vencimento: "2026-02-28", recebido: false },
      { valor: 3000, vencimento: "2026-03-31", recebido: false },
      { valor: 3000, vencimento: "2026-04-30", recebido: false },
    ]);
    expect(parcelar({ total: 1000, dataVenda: "2026-11-19", parcelas: 3, primeiroVencimento: "2026-12-10" }).map((x) => x.valor)).toEqual([334, 333, 333]);
  });

  it("exige parcelas quando sobra valor", () => {
    expect(() => parcelar({ total: 1000, dataVenda: "2026-11-19", entrada: 200 })).toThrow(/parcelas/);
    expect(() => parcelar({ total: 1000, dataVenda: "2026-11-19", entrada: 2000 })).toThrow(/entrada/);
  });
});

describe("devolução", () => {
  const item = { quantidade: 3, quantidadeDevolvida: 0, subtotal: 30000, descontoRateado: 1000, custoUnitario: 5000, comissao: 3000 };

  it("devoluções parciais somam exatamente o valor do item", () => {
    const a = calcularDevolucaoItem(item, 1);
    const b = calcularDevolucaoItem({ ...item, quantidadeDevolvida: 1 }, 1);
    const c = calcularDevolucaoItem({ ...item, quantidadeDevolvida: 2 }, 1);
    expect(a.receita + b.receita + c.receita).toBe(29000);
    expect(a.comissao + b.comissao + c.comissao).toBe(3000);
    expect(a.receita).toBe(9667);
    expect(a.custo).toBe(5000);
  });

  it("não devolve mais do que resta", () => {
    expect(() => calcularDevolucaoItem({ ...item, quantidadeDevolvida: 2 }, 2)).toThrow(/Só restam 1/);
  });

  it("resultado considera devolução e cancelamento", () => {
    const base = { status: "concluida" as const, pecas: 3, totalLiquido: 29000, custoTotal: 15000, comissaoTotal: 3000, devolvidoPecas: 0, devolvidoReceita: 0, devolvidoCusto: 0, comissaoRevertida: 0 };
    expect(resultadoDaVenda(base).lucro).toBe(11000);
    expect(resultadoDaVenda({ ...base, status: "parcialmente_devolvida", devolvidoPecas: 1, devolvidoReceita: 9667, devolvidoCusto: 5000, comissaoRevertida: 1000 })).toEqual({
      faturamento: 19333,
      custo: 10000,
      comissoes: 2000,
      lucro: 7333,
      pecas: 2,
    });
    expect(resultadoDaVenda({ ...base, status: "cancelada" }).lucro).toBe(-3000);
  });
});
