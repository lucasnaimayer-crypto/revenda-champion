import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { juntarLinhas, lerPreco, montarPagina, type ElementosPagina, type TextoPagina } from "./montar";
import { retanguloDaImagem } from "./pdf";

function texto(t: string, x: number, y: number, largura = 40, altura = 9): TextoPagina {
  return { texto: t, x, y, largura, altura };
}

// Página no padrão Champion: grade 3x3, foto e logo abaixo código e preço.
function paginaGrade(): ElementosPagina {
  const colunas = [27, 220, 413];
  const linhas = [539, 291, 43];
  const textos: TextoPagina[] = [];
  const imagens = [{ x: 90, y: 760, largura: 420, altura: 45 }]; // logotipo no topo
  let n = 0;
  for (const y of linhas) {
    for (const x of colunas) {
      n++;
      imagens.push({ x, y, largura: 159, altura: 213 });
      textos.push(texto(`CN2000${n}A`, x + 60, y - 9));
      textos.push(texto(`R$ ${100 + n},90`, x + 60, y - 20));
    }
  }
  return { numero: 1, largura: 595, altura: 842, textos, imagens };
}

describe("lerPreco", () => {
  it("aceita os formatos do catálogo", () => {
    expect(lerPreco("R$ 124,90")).toBe(12490);
    expect(lerPreco("R$  1.234,56")).toBe(123456);
    expect(lerPreco("R$156,89")).toBe(15689);
    expect(lerPreco("124,90")).toBeNull();
    expect(lerPreco("CH22911P")).toBeNull();
  });
});

describe("juntarLinhas", () => {
  it("junta pedaços da mesma linha", () => {
    const r = juntarLinhas([texto("R$", 100, 50, 10), texto("124,90", 113, 50, 25)]);
    expect(r).toHaveLength(1);
    expect(r[0].texto).toBe("R$ 124,90");
  });
  it("não junta colunas distantes", () => {
    expect(juntarLinhas([texto("CN1", 100, 50), texto("CN2", 300, 50)])).toHaveLength(2);
  });
});

describe("montarPagina", () => {
  it("lê as 9 peças de uma grade, na ordem de leitura, cada uma com sua foto", () => {
    const r = montarPagina(paginaGrade());
    expect(r.avisos).toEqual([]);
    expect(r.pecas.map((p) => p.codigo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `CN2000${n}A`));
    expect(r.pecas.map((p) => p.custo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (100 + n) * 100 + 90));
    expect(r.pecas.map((p) => p.posicao)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(r.pecas[0].foto).toEqual({ x: 27, y: 539, largura: 159, altura: 213 });
    expect(r.pecas[8].foto).toEqual({ x: 413, y: 43, largura: 159, altura: 213 });
  });

  it("escolhe a foto maior quando há miniaturas na mesma célula", () => {
    const el = paginaGrade();
    el.imagens.push({ x: 30, y: 700, largura: 40, altura: 50 });
    const r = montarPagina(el);
    expect(r.pecas[0].foto).toEqual({ x: 27, y: 539, largura: 159, altura: 213 });
  });

  it("avisa quando um preço não tem código e quando falta foto", () => {
    const el: ElementosPagina = {
      numero: 2,
      largura: 595,
      altura: 842,
      textos: [texto("R$ 99,90", 100, 400), texto("CN99999Z", 300, 409), texto("R$ 88,90", 300, 400)],
      imagens: [],
    };
    const r = montarPagina(el);
    expect(r.pecas.map((p) => p.codigo)).toEqual(["CN99999Z"]);
    expect(r.avisos).toEqual(["Preço R$ 99,90 sem código acima dele.", "Peça CN99999Z sem foto encontrada."]);
  });

  it("página sem texto não gera peças", () => {
    const r = montarPagina({ numero: 3, largura: 595, altura: 842, textos: [], imagens: [{ x: 0, y: 0, largura: 595, altura: 842 }] });
    expect(r.pecas).toEqual([]);
  });
});

describe("retanguloDaImagem", () => {
  it("converte a matriz da imagem em retângulo", () => {
    expect(retanguloDaImagem([159, 0, 0, 213, 27, 539])).toEqual({ x: 27, y: 539, largura: 159, altura: 213 });
    // imagem espelhada verticalmente ocupa o mesmo retângulo
    expect(retanguloDaImagem([159, 0, 0, -213, 27, 752])).toEqual({ x: 27, y: 539, largura: 159, altura: 213 });
  });
});

// Catálogos reais não ficam no repositório. Para rodar: CATALOGOS_DIR=/pasta/com/pdfs pnpm test
const pasta = process.env.CATALOGOS_DIR;
describe.skipIf(!pasta || !existsSync(pasta))("catálogos reais", () => {
  const arquivos = pasta && existsSync(pasta) ? readdirSync(pasta).filter((f) => f.toLowerCase().endsWith(".pdf")) : [];
  for (const arquivo of arquivos) {
    it(`${arquivo}: toda peça tem código, preço e foto`, async () => {
      const { lerCatalogoPdf } = await import("./node");
      const r = await lerCatalogoPdf(new Uint8Array(readFileSync(join(pasta!, arquivo))));
      expect(r.pecas.length).toBeGreaterThan(0);
      expect(r.pecas.filter((p) => !p.foto)).toEqual([]);
      expect(r.pecas.filter((p) => p.custo <= 0)).toEqual([]);
      expect(r.paginas.flatMap((p) => p.avisos)).toEqual([]);
    }, 60_000);
  }
});
