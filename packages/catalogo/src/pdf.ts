// Extrai textos e posições de imagens de uma página PDF usando o pdf.js.
// Recebe o módulo do pdf.js já carregado, para funcionar tanto no navegador (build normal,
// com worker) quanto no Node (build legacy, nos testes).

import type { ElementosPagina, Retangulo, TextoPagina } from "./montar";

type Matriz = [number, number, number, number, number, number];

interface ItemTexto {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export interface PaginaPdf {
  getViewport(o: { scale: number }): { width: number; height: number; viewBox?: number[] };
  getTextContent(): Promise<{ items: unknown[] }>;
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
}

export interface OpsPdf {
  save: number;
  restore: number;
  transform: number;
  paintImageXObject: number;
  paintInlineImageXObject: number;
  paintImageMaskXObject: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
}

const IDENTIDADE: Matriz = [1, 0, 0, 1, 0, 0];

function multiplicar(m: Matriz, n: Matriz): Matriz {
  // Resultado aplica n primeiro e depois m (convenção do PDF: CTM' = n × CTM).
  return [
    n[0] * m[0] + n[1] * m[2],
    n[0] * m[1] + n[1] * m[3],
    n[2] * m[0] + n[3] * m[2],
    n[2] * m[1] + n[3] * m[3],
    n[4] * m[0] + n[5] * m[2] + m[4],
    n[4] * m[1] + n[5] * m[3] + m[5],
  ];
}

function aplicar(m: Matriz, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Retângulo ocupado pelo quadrado unitário de uma imagem depois da matriz atual. */
export function retanguloDaImagem(m: Matriz): Retangulo {
  const cantos = [aplicar(m, 0, 0), aplicar(m, 1, 0), aplicar(m, 0, 1), aplicar(m, 1, 1)];
  const xs = cantos.map((c) => c[0]);
  const ys = cantos.map((c) => c[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, largura: Math.max(...xs) - x, altura: Math.max(...ys) - y };
}

function ehMatriz(v: unknown): v is Matriz {
  return Array.isArray(v) && v.length === 6 && v.every((n) => typeof n === "number");
}

export async function extrairElementos(pagina: PaginaPdf, numero: number, ops: OpsPdf): Promise<ElementosPagina> {
  const vista = pagina.getViewport({ scale: 1 });
  const caixa = vista.viewBox ?? [0, 0, vista.width, vista.height];
  const [x0, y0] = caixa;

  const conteudo = await pagina.getTextContent();
  const textos: TextoPagina[] = [];
  for (const bruto of conteudo.items) {
    const item = bruto as ItemTexto;
    if (typeof item?.str !== "string" || !item.transform) continue;
    const [a, b, , d, e, f] = item.transform;
    // Ignora texto girado (rótulos na vertical ao lado das fotos).
    if (Math.abs(b) > Math.abs(a) * 0.1) continue;
    textos.push({ texto: item.str, x: e - x0, y: f - y0, largura: item.width, altura: item.height || Math.abs(d) });
  }

  const lista = await pagina.getOperatorList();
  const imagens: Retangulo[] = [];
  const pilha: Matriz[] = [];
  let atual: Matriz = IDENTIDADE;
  for (let i = 0; i < lista.fnArray.length; i++) {
    const fn = lista.fnArray[i];
    const args = lista.argsArray[i] ?? [];
    if (fn === ops.save) pilha.push(atual);
    else if (fn === ops.restore) atual = pilha.pop() ?? IDENTIDADE;
    else if (fn === ops.transform && ehMatriz(args)) atual = multiplicar(atual, args);
    else if (fn === ops.paintFormXObjectBegin) {
      pilha.push(atual);
      if (ehMatriz(args[0])) atual = multiplicar(atual, args[0]);
    } else if (fn === ops.paintFormXObjectEnd) atual = pilha.pop() ?? IDENTIDADE;
    else if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject || fn === ops.paintImageMaskXObject) {
      const r = retanguloDaImagem(atual);
      imagens.push({ ...r, x: r.x - x0, y: r.y - y0 });
    }
  }

  return { numero, largura: vista.width, altura: vista.height, textos, imagens };
}
