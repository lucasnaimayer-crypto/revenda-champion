// Conferência do que a IA leu numa foto ou print de catálogo.
// A IA devolve código e preço como texto e a caixa de cada relógio em milésimos da imagem;
// aqui isso vira peças no mesmo formato da leitura de PDF, sem confiar cegamente na resposta:
// código fora do padrão ou preço ilegível ficam marcados para o revendedor conferir.
import { CODIGO } from "./montar";

/** O que o modelo devolve para cada peça (ver o esquema em apps/web/src/lib/ia.ts). */
export interface PecaIaBruta {
  codigo: string;
  preco: string;
  /** Caixa do relógio em milésimos da imagem (0 a 1000), origem no canto superior esquerdo. */
  x: number;
  y: number;
  largura: number;
  altura: number;
  legivel: boolean;
}

export interface CaixaRelativa {
  /** Frações da imagem (0 a 1), origem no canto superior esquerdo. */
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export interface PecaIa {
  posicao: number;
  codigo: string;
  /** Centavos; 0 quando o preço não foi lido com segurança. */
  custo: number;
  caixa: CaixaRelativa | null;
  /** true quando código ou preço precisam de conferência. */
  conferir: boolean;
}

const PRECO_TEXTO = /^(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/i;
const LIMITE_PECAS = 60;

export function lerPrecoIa(texto: string): number | null {
  const m = String(texto ?? "").trim().replace(/\s+/g, " ").match(PRECO_TEXTO);
  if (!m) return null;
  const valor = Number(m[1].replace(/\./g, "")) * 100 + Number(m[2]);
  return valor > 0 ? valor : null;
}

function caixa(p: PecaIaBruta): CaixaRelativa | null {
  const nums = [p.x, p.y, p.largura, p.altura];
  if (!nums.every((n) => Number.isFinite(n))) return null;
  const x = Math.min(Math.max(p.x, 0), 1000);
  const y = Math.min(Math.max(p.y, 0), 1000);
  const largura = Math.min(Math.max(p.largura, 0), 1000 - x);
  const altura = Math.min(Math.max(p.altura, 0), 1000 - y);
  // Caixas minúsculas são ruído; melhor sem foto do que um recorte errado.
  if (largura < 20 || altura < 20) return null;
  return { x: x / 1000, y: y / 1000, largura: largura / 1000, altura: altura / 1000 };
}

/** Normaliza a resposta da IA: limpa códigos, lê preços, descarta vazios e junta repetidos. */
export function normalizarLeituraIa(brutas: PecaIaBruta[]): { pecas: PecaIa[]; avisos: string[] } {
  const avisos: string[] = [];
  const vistos = new Set<string>();
  const pecas: PecaIa[] = [];
  for (const p of brutas.slice(0, LIMITE_PECAS)) {
    const codigo = String(p.codigo ?? "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 40);
    const custo = lerPrecoIa(p.preco);
    if (!codigo && custo === null) continue;
    if (codigo && vistos.has(codigo)) {
      avisos.push(`O código ${codigo} apareceu mais de uma vez na imagem; ficou só a primeira.`);
      continue;
    }
    if (codigo) vistos.add(codigo);
    pecas.push({
      posicao: pecas.length + 1,
      codigo,
      custo: custo ?? 0,
      caixa: caixa(p),
      conferir: !p.legivel || !CODIGO.test(codigo) || custo === null,
    });
  }
  if (brutas.length > LIMITE_PECAS) avisos.push(`A imagem tinha mais de ${LIMITE_PECAS} peças; envie em partes.`);
  return { pecas, avisos };
}
