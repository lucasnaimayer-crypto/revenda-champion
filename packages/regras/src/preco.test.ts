import { describe, expect, it } from "vitest";
import { arredondar, calcularPeca, resumir, type CustoTipo, type RegraPreco } from "./preco";
import { formatarReais, lerReais } from "./dinheiro";

// Mesma configuração fixa do SEVENIA (base44/shared/ln7Pedido.ts), para provar que a conta bate.
const REGRA_SEVENIA: RegraPreco = { freteBp: 500, markupBp: 10000, arredondamento: "nenhum" };
const SACOLA: CustoTipo = { id: "sacola", nome: "Sacola", modo: "fixo", valor: 414, aplicaATodos: true };
const COMISSOES = [
  { nome: "Queiroz", percentualBp: 1000 },
  { nome: "Indicação", percentualBp: 1000 },
];

describe("calcularPeca", () => {
  it("reproduz o cálculo do Pedidos Champion do SEVENIA", () => {
    const r = calcularPeca({ custo: 12490, regra: REGRA_SEVENIA, custos: [SACOLA], comissoes: COMISSOES });
    // frete = round(12490 * 5%) = 625; base = 12490 + 625 + 414 = 13529; venda = 27058
    expect(r.frete).toBe(625);
    expect(r.custoTotal).toBe(13529);
    expect(r.precoVenda).toBe(27058);
    expect(r.comissoes.map((c) => c.valor)).toEqual([2706, 2706]);
    expect(r.lucro).toBe(27058 - 13529 - 2706 - 2706);
  });

  it("sem configuração, vende pelo dobro do custo e não inventa custos", () => {
    const r = calcularPeca({ custo: 10000, regra: { freteBp: 0, markupBp: 10000, arredondamento: "nenhum" } });
    expect(r.custoTotal).toBe(10000);
    expect(r.precoVenda).toBe(20000);
    expect(r.lucro).toBe(10000);
    expect(r.margemBp).toBe(5000);
  });

  it("soma custos fixos e percentuais", () => {
    const custos: CustoTipo[] = [
      { id: "emb", nome: "Embalagem", modo: "fixo", valor: 500, aplicaATodos: true },
      { id: "taxa", nome: "Taxa cartão", modo: "percentual", valor: 300, aplicaATodos: true },
    ];
    const r = calcularPeca({ custo: 10000, regra: { freteBp: 0, markupBp: 0, arredondamento: "nenhum" }, custos });
    expect(r.custos).toEqual([
      { nome: "Embalagem", valor: 500 },
      { nome: "Taxa cartão", valor: 300 },
    ]);
    expect(r.custoTotal).toBe(10800);
  });

  it("aplica ajustes do produto: troca valor, inclui opcional e remove custo", () => {
    const custos: CustoTipo[] = [
      { id: "emb", nome: "Embalagem", modo: "fixo", valor: 500, aplicaATodos: true },
      { id: "grav", nome: "Gravação", modo: "fixo", valor: 1500, aplicaATodos: false },
      { id: "estojo", nome: "Estojo", modo: "fixo", valor: 800, aplicaATodos: true },
    ];
    const regra: RegraPreco = { freteBp: 0, markupBp: 0, arredondamento: "nenhum" };
    const semAjuste = calcularPeca({ custo: 10000, regra, custos });
    expect(semAjuste.custos.map((c) => c.nome)).toEqual(["Embalagem", "Estojo"]);

    const comAjuste = calcularPeca({ custo: 10000, regra, custos, ajustesDoProduto: { emb: 700, grav: 1500, estojo: null } });
    expect(comAjuste.custos).toEqual([
      { nome: "Embalagem", valor: 700 },
      { nome: "Gravação", valor: 1500 },
    ]);
    expect(comAjuste.custoTotal).toBe(12200);
  });

  it("respeita preço manual", () => {
    const r = calcularPeca({ custo: 10000, regra: REGRA_SEVENIA, precoManual: 25000 });
    expect(r.precoVenda).toBe(25000);
  });

  it("multiplica totais pela quantidade", () => {
    const r = calcularPeca({ custo: 10000, quantidade: 3, regra: { freteBp: 0, markupBp: 10000, arredondamento: "nenhum" } });
    expect(r.totais).toMatchObject({ custoPeca: 30000, venda: 60000, lucro: 30000 });
  });

  it("ignora valores negativos ou inválidos", () => {
    const r = calcularPeca({ custo: -50, quantidade: 0, regra: { freteBp: -1, markupBp: Number.NaN, arredondamento: "nenhum" } });
    expect(r).toMatchObject({ custoPeca: 0, quantidade: 1, frete: 0, precoVenda: 0, lucro: 0, margemBp: 0 });
  });
});

describe("arredondar", () => {
  it("inteiro sobe para o próximo real", () => {
    expect(arredondar(27058, "inteiro")).toBe(27100);
    expect(arredondar(27000, "inteiro")).toBe(27000);
  });
  it("final_90 vai para o próximo ,90", () => {
    expect(arredondar(27058, "final_90")).toBe(27090);
    expect(arredondar(27095, "final_90")).toBe(27190);
    expect(arredondar(27090, "final_90")).toBe(27090);
  });
});

describe("resumir", () => {
  it("soma peças e totais e calcula a margem", () => {
    const regra: RegraPreco = { freteBp: 0, markupBp: 10000, arredondamento: "nenhum" };
    const r = resumir([calcularPeca({ custo: 10000, quantidade: 2, regra }), calcularPeca({ custo: 5000, regra })]);
    expect(r).toEqual({ pecas: 3, custoPeca: 25000, custoTotal: 25000, venda: 50000, comissoes: 0, lucro: 25000, margemBp: 5000 });
  });
});

describe("dinheiro", () => {
  it("lê os formatos de preço do catálogo", () => {
    expect(lerReais("R$ 124,90")).toBe(12490);
    expect(lerReais("R$1.234,56")).toBe(123456);
    expect(lerReais("189.90")).toBe(18990);
    expect(lerReais("abc")).toBeNull();
    expect(lerReais("")).toBeNull();
  });
  it("formata em reais", () => {
    expect(formatarReais(12490).replace(/\s/g, " ")).toBe("R$ 124,90");
  });
});
