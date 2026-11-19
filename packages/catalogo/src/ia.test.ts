import { describe, expect, it } from "vitest";
import { lerPrecoIa, normalizarLeituraIa, type PecaIaBruta } from "./ia";

const peca = (parte: Partial<PecaIaBruta>): PecaIaBruta => ({ codigo: "CN29018X", preco: "R$ 189,90", x: 100, y: 50, largura: 250, altura: 300, legivel: true, ...parte });

describe("lerPrecoIa", () => {
  it("lê preços em reais como aparecem no catálogo", () => {
    expect(lerPrecoIa("R$ 189,90")).toBe(18990);
    expect(lerPrecoIa("R$1.234,50")).toBe(123450);
    expect(lerPrecoIa("99,00")).toBe(9900);
  });
  it("recusa o que não é preço claro", () => {
    expect(lerPrecoIa("")).toBeNull();
    expect(lerPrecoIa("189")).toBeNull();
    expect(lerPrecoIa("R$ 1,9")).toBeNull();
    expect(lerPrecoIa("R$ 0,00")).toBeNull();
  });
});

describe("normalizarLeituraIa", () => {
  it("converte código, preço e caixa", () => {
    const { pecas, avisos } = normalizarLeituraIa([peca({ codigo: " cn29018x " })]);
    expect(avisos).toEqual([]);
    expect(pecas).toEqual([{ posicao: 1, codigo: "CN29018X", custo: 18990, caixa: { x: 0.1, y: 0.05, largura: 0.25, altura: 0.3 }, conferir: false }]);
  });

  it("marca para conferir o que veio ilegível ou fora do padrão", () => {
    const { pecas } = normalizarLeituraIa([peca({ legivel: false }), peca({ codigo: "C?1", preco: "R$ 10,00" }), peca({ codigo: "CH1234", preco: "ilegível" })]);
    expect(pecas.map((p) => [p.codigo, p.custo, p.conferir])).toEqual([
      ["CN29018X", 18990, true],
      ["C?1", 1000, true],
      ["CH1234", 0, true],
    ]);
  });

  it("descarta vazios, junta códigos repetidos e corta caixas fora da imagem", () => {
    const { pecas, avisos } = normalizarLeituraIa([
      peca({ x: 900, y: 900, largura: 400, altura: 400 }),
      peca({ codigo: "", preco: "" }),
      peca({ preco: "R$ 1,00" }),
      peca({ codigo: "CH5555", largura: 5 }),
    ]);
    expect(pecas.map((p) => p.codigo)).toEqual(["CN29018X", "CH5555"]);
    expect(pecas[0].caixa).toEqual({ x: 0.9, y: 0.9, largura: 0.1, altura: 0.1 });
    expect(pecas[1].caixa).toBeNull();
    expect(pecas[1].posicao).toBe(2);
    expect(avisos).toHaveLength(1);
  });
});
