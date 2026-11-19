// Monta as peças de uma página de catálogo a partir dos textos e das imagens que ela contém.
// Funciona sem IA: nos catálogos da Champion cada relógio é uma imagem e, logo abaixo dela,
// vêm o código e o preço como texto. As coordenadas seguem o PDF: origem no canto inferior
// esquerdo, y cresce para cima.

export interface Retangulo {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export interface TextoPagina {
  texto: string;
  x: number;
  /** Linha de base do texto. */
  y: number;
  largura: number;
  altura: number;
}

export interface ElementosPagina {
  numero: number;
  largura: number;
  altura: number;
  textos: TextoPagina[];
  imagens: Retangulo[];
}

export interface PecaLida {
  pagina: number;
  /** Ordem de leitura na página, da esquerda para a direita e de cima para baixo, a partir de 1. */
  posicao: number;
  codigo: string;
  /** Preço do catálogo em centavos. */
  custo: number;
  /** Onde está a foto do relógio na página; null quando não foi encontrada. */
  foto: Retangulo | null;
  /** Onde estão o código e o preço, para destacar na revisão. */
  rotulo: Retangulo;
}

export interface PaginaLida {
  numero: number;
  largura: number;
  altura: number;
  pecas: PecaLida[];
  avisos: string[];
}

const PRECO = /^R\$\s*(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/;
const CODIGO = /^[A-Z0-9][A-Z0-9.\-/]{3,23}$/;

function limpar(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function lerPreco(texto: string): number | null {
  const m = PRECO.exec(limpar(texto));
  if (!m) return null;
  return Number(m[1].replace(/\./g, "")) * 100 + Number(m[2]);
}

function centroX(t: { x: number; largura: number }): number {
  return t.x + t.largura / 2;
}

/**
 * Junta pedaços de texto que estão na mesma linha e encostados ("R$" + "124,90"),
 * porque o PDF pode quebrar uma palavra em vários itens.
 */
export function juntarLinhas(textos: TextoPagina[]): TextoPagina[] {
  const itens = textos
    .filter((t) => limpar(t.texto) !== "")
    .map((t) => ({ ...t, texto: limpar(t.texto) }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const saida: TextoPagina[] = [];
  for (const t of itens) {
    const anterior = saida[saida.length - 1];
    const tolerancia = Math.max(1, t.altura * 0.3);
    const lacuna = anterior ? t.x - (anterior.x + anterior.largura) : Infinity;
    if (anterior && Math.abs(anterior.y - t.y) <= tolerancia && lacuna >= -1 && lacuna <= t.altura * 0.6) {
      const fim = Math.max(anterior.x + anterior.largura, t.x + t.largura);
      anterior.texto = `${anterior.texto}${lacuna > t.altura * 0.15 ? " " : ""}${t.texto}`;
      anterior.largura = fim - anterior.x;
      anterior.altura = Math.max(anterior.altura, t.altura);
    } else {
      saida.push({ ...t });
    }
  }
  return saida;
}

/** Imagens muito pequenas ou muito largas (logotipo, faixas) não são foto de peça. */
function pareceFoto(img: Retangulo, pagina: { largura: number; altura: number }): boolean {
  const area = img.largura * img.altura;
  if (area < pagina.largura * pagina.altura * 0.01) return false;
  const proporcao = img.largura / img.altura;
  return proporcao > 0.25 && proporcao < 3;
}

export function montarPagina(el: ElementosPagina): PaginaLida {
  const linhas = juntarLinhas(el.textos);
  const precos = linhas
    .map((t) => ({ t, custo: lerPreco(t.texto) }))
    .filter((p): p is { t: TextoPagina; custo: number } => p.custo !== null);
  const usados = new Set<TextoPagina>();
  const avisos: string[] = [];
  const brutas: Omit<PecaLida, "posicao">[] = [];

  for (const { t: preco, custo } of precos) {
    // Código: o texto mais próximo logo acima do preço, alinhado na mesma coluna.
    const candidatos = linhas
      .filter((c) => c !== preco && !usados.has(c) && CODIGO.test(c.texto) && lerPreco(c.texto) === null)
      .filter((c) => c.y > preco.y && c.y - preco.y <= preco.altura * 3)
      .filter((c) => Math.abs(centroX(c) - centroX(preco)) <= Math.max(c.largura, preco.largura))
      .sort((a, b) => a.y - preco.y - (b.y - preco.y) || Math.abs(centroX(a) - centroX(preco)) - Math.abs(centroX(b) - centroX(preco)));
    const codigo = candidatos[0];
    if (!codigo) {
      avisos.push(`Preço ${preco.texto} sem código acima dele.`);
      continue;
    }
    usados.add(codigo);
    const rotulo: Retangulo = {
      x: Math.min(codigo.x, preco.x),
      y: preco.y - preco.altura * 0.25,
      largura: Math.max(codigo.x + codigo.largura, preco.x + preco.largura) - Math.min(codigo.x, preco.x),
      altura: codigo.y + codigo.altura - (preco.y - preco.altura * 0.25),
    };
    brutas.push({ pagina: el.numero, codigo: codigo.texto.toUpperCase(), custo, foto: null, rotulo });
  }

  // Foto: a maior imagem acima do rótulo, na mesma coluna, sem passar do rótulo de cima.
  const fotos = el.imagens.filter((img) => pareceFoto(img, el));
  for (const peca of brutas) {
    const cx = centroX(peca.rotulo);
    const topoRotulo = peca.rotulo.y + peca.rotulo.altura;
    const tetoColuna = brutas
      .filter((o) => o !== peca && o.rotulo.y > topoRotulo && Math.abs(centroX(o.rotulo) - cx) < Math.max(o.rotulo.largura, peca.rotulo.largura) * 2)
      .reduce((min, o) => Math.min(min, o.rotulo.y), el.altura);
    const opcoes = fotos
      .filter((img) => img.x - 2 <= cx && cx <= img.x + img.largura + 2)
      .filter((img) => img.y >= topoRotulo - img.altura * 0.1 && img.y < tetoColuna)
      .sort((a, b) => b.largura * b.altura - a.largura * a.altura);
    peca.foto = opcoes[0] ?? null;
    if (!peca.foto) avisos.push(`Peça ${peca.codigo} sem foto encontrada.`);
  }

  // Duas peças com a mesma foto indica que a página não segue o padrão esperado.
  const porFoto = new Map<Retangulo, string[]>();
  for (const p of brutas) if (p.foto) porFoto.set(p.foto, [...(porFoto.get(p.foto) ?? []), p.codigo]);
  for (const [, codigos] of porFoto) if (codigos.length > 1) avisos.push(`Mesma foto para ${codigos.join(", ")}.`);

  const linhaDe = (p: Omit<PecaLida, "posicao">) => p.rotulo.y;
  const ordenadas = [...brutas].sort((a, b) => {
    const mesmaLinha = Math.abs(linhaDe(a) - linhaDe(b)) < Math.max(a.rotulo.altura, b.rotulo.altura);
    return mesmaLinha ? a.rotulo.x - b.rotulo.x : linhaDe(b) - linhaDe(a);
  });

  return {
    numero: el.numero,
    largura: el.largura,
    altura: el.altura,
    pecas: ordenadas.map((p, i) => ({ ...p, posicao: i + 1 })),
    avisos,
  };
}

export interface ResultadoCatalogo {
  paginas: PaginaLida[];
  pecas: PecaLida[];
  /** Páginas sem nenhum preço em texto: provavelmente escaneadas, vão para a leitura por IA. */
  paginasSemTexto: number[];
  codigosRepetidos: string[];
}

export function consolidar(paginas: PaginaLida[]): ResultadoCatalogo {
  const pecas = paginas.flatMap((p) => p.pecas);
  const contagem = new Map<string, number>();
  for (const p of pecas) contagem.set(p.codigo, (contagem.get(p.codigo) ?? 0) + 1);
  return {
    paginas,
    pecas,
    paginasSemTexto: paginas.filter((p) => p.pecas.length === 0).map((p) => p.numero),
    codigosRepetidos: [...contagem].filter(([, n]) => n > 1).map(([c]) => c),
  };
}
