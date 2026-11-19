import { describe, expect, it } from "vitest";
import { faturamentoPorDia, maisVendidos, pecasParadas, resumirVendas, variacaoBp } from "./painel";

const base = { pecas: 2, totalLiquido: 20000, custoTotal: 10000, comissaoTotal: 2000, devolvidoPecas: 0, devolvidoReceita: 0, devolvidoCusto: 0, comissaoRevertida: 0 };

describe("resumirVendas", () => {
  it("soma faturamento e lucro descontando devoluções e cancelamentos", () => {
    const r = resumirVendas([
      { ...base, status: "concluida" },
      { ...base, status: "parcialmente_devolvida", devolvidoPecas: 1, devolvidoReceita: 10000, devolvidoCusto: 5000, comissaoRevertida: 1000 },
      { ...base, status: "cancelada" },
    ]);
    expect(r.vendas).toBe(2);
    expect(r.pecas).toBe(3);
    expect(r.faturamento).toBe(30000);
    expect(r.custo).toBe(15000);
    // comissões: 2000 + 1000 + 2000 mantida no cancelamento
    expect(r.comissoes).toBe(5000);
    expect(r.lucro).toBe(30000 - 15000 - 5000);
    expect(r.ticketMedio).toBe(15000);
    expect(r.margemBp).toBe(3333);
  });

  it("sem vendas fica tudo zerado", () => {
    expect(resumirVendas([])).toEqual({ vendas: 0, pecas: 0, faturamento: 0, custo: 0, comissoes: 0, lucro: 0, margemBp: 0, ticketMedio: 0 });
  });
});

describe("variação e dias", () => {
  it("calcula a variação contra o mês anterior", () => {
    expect(variacaoBp(15000, 10000)).toBe(5000);
    expect(variacaoBp(5000, 10000)).toBe(-5000);
    expect(variacaoBp(100, 0)).toBeNull();
  });

  it("faturamento por dia cobre o mês inteiro", () => {
    const dias = faturamentoPorDia(
      [
        { ...base, status: "concluida", data: "2026-02-03" },
        { ...base, status: "concluida", data: "2026-02-03" },
        { ...base, status: "concluida", data: "2026-03-01" },
      ],
      "2026-02"
    );
    expect(dias).toHaveLength(28);
    expect(dias[2]).toEqual({ dia: 3, valor: 40000 });
    expect(dias.reduce((s, d) => s + d.valor, 0)).toBe(40000);
  });
});

describe("maisVendidos", () => {
  it("ordena por peças líquidas de devolução", () => {
    const r = maisVendidos([
      { produtoId: "a", codigo: "A", imagemPath: null, quantidade: 3, quantidadeDevolvida: 2, receita: 30000 },
      { produtoId: "b", codigo: "B", imagemPath: null, quantidade: 2, quantidadeDevolvida: 0, receita: 10000 },
      { produtoId: "a", codigo: "A", imagemPath: null, quantidade: 1, quantidadeDevolvida: 0, receita: 9000 },
      { produtoId: "c", codigo: "C", imagemPath: null, quantidade: 1, quantidadeDevolvida: 1, receita: 9000 },
    ]);
    expect(r.map((x) => [x.codigo, x.pecas, x.receita])).toEqual([
      ["A", 2, 19000],
      ["B", 2, 10000],
    ]);
  });
});

describe("pecasParadas", () => {
  it("lista quem tem estoque e não vende há 60 dias, contando da entrada se nunca vendeu", () => {
    const r = pecasParadas(
      [
        { produtoId: "1", codigo: "VENDE", saldo: 2, custoUnitario: 100, ultimaVenda: "2026-11-01T12:00:00Z", ultimaEntrada: "2026-01-01T00:00:00Z" },
        { produtoId: "2", codigo: "PARADO", saldo: 3, custoUnitario: 100, ultimaVenda: "2026-08-01T12:00:00Z", ultimaEntrada: "2026-01-01T00:00:00Z" },
        { produtoId: "3", codigo: "NUNCA", saldo: 1, custoUnitario: 500, ultimaVenda: null, ultimaEntrada: "2026-06-01T00:00:00Z" },
        { produtoId: "4", codigo: "ZERADO", saldo: 0, custoUnitario: 100, ultimaVenda: null, ultimaEntrada: "2025-01-01T00:00:00Z" },
        { produtoId: "5", codigo: "NOVO", saldo: 1, custoUnitario: 100, ultimaVenda: null, ultimaEntrada: "2026-11-10T00:00:00Z" },
      ],
      "2026-11-19"
    );
    expect(r.map((p) => [p.codigo, p.diasParado, p.valorParado])).toEqual([
      ["NUNCA", 171, 500],
      ["PARADO", 110, 300],
    ]);
  });
});
