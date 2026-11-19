// Indicadores do painel: faturamento, lucro, margem, ticket médio, mais vendidos e peças paradas.
import { margemBp, resultadoDaVenda, type VendaGravada } from "./venda";

export interface VendaDoPainel extends VendaGravada {
  /** AAAA-MM-DD */
  data: string;
}

export interface ResumoVendas {
  vendas: number;
  pecas: number;
  faturamento: number;
  custo: number;
  comissoes: number;
  lucro: number;
  margemBp: number;
  ticketMedio: number;
}

/** Soma as vendas já descontando devoluções e cancelamentos. Canceladas não contam como venda. */
export function resumirVendas(vendas: VendaGravada[]): ResumoVendas {
  const t = { vendas: 0, pecas: 0, faturamento: 0, custo: 0, comissoes: 0, lucro: 0 };
  for (const v of vendas) {
    const r = resultadoDaVenda(v);
    if (v.status !== "cancelada" && v.status !== "devolvida") t.vendas += 1;
    t.pecas += r.pecas;
    t.faturamento += r.faturamento;
    t.custo += r.custo;
    t.comissoes += r.comissoes;
    t.lucro += r.lucro;
  }
  return { ...t, margemBp: margemBp(t.lucro, t.faturamento), ticketMedio: t.vendas > 0 ? Math.round(t.faturamento / t.vendas) : 0 };
}

/** Variação percentual (em pontos-base) entre dois valores; null quando não há base de comparação. */
export function variacaoBp(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((atual - anterior) * 10000) / Math.abs(anterior));
}

/** Faturamento de cada dia do mês "AAAA-MM", do dia 1 ao último. */
export function faturamentoPorDia(vendas: VendaDoPainel[], mes: string): { dia: number; valor: number }[] {
  const [a, m] = mes.split("-").map(Number);
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const lista = Array.from({ length: dias }, (_, i) => ({ dia: i + 1, valor: 0 }));
  for (const v of vendas) {
    if (!v.data.startsWith(mes)) continue;
    lista[Number(v.data.slice(8, 10)) - 1].valor += resultadoDaVenda(v).faturamento;
  }
  return lista;
}

export interface ItemVendidoPainel {
  produtoId: string | null;
  codigo: string;
  imagemPath: string | null;
  quantidade: number;
  quantidadeDevolvida: number;
  /** Subtotal menos desconto rateado. */
  receita: number;
}

/** Peças mais vendidas (quantidade líquida de devoluções), da maior para a menor. */
export function maisVendidos(itens: ItemVendidoPainel[], limite = 5) {
  const porCodigo = new Map<string, { codigo: string; produtoId: string | null; imagemPath: string | null; pecas: number; receita: number }>();
  for (const i of itens) {
    const pecas = i.quantidade - i.quantidadeDevolvida;
    if (pecas <= 0) continue;
    const atual = porCodigo.get(i.codigo) ?? { codigo: i.codigo, produtoId: i.produtoId, imagemPath: i.imagemPath, pecas: 0, receita: 0 };
    atual.pecas += pecas;
    atual.receita += Math.round((i.receita * pecas) / i.quantidade);
    porCodigo.set(i.codigo, atual);
  }
  return [...porCodigo.values()].sort((a, b) => b.pecas - a.pecas || b.receita - a.receita || a.codigo.localeCompare(b.codigo)).slice(0, limite);
}

export interface GiroProduto {
  produtoId: string;
  codigo: string;
  saldo: number;
  custoUnitario: number;
  /** ISO da última venda, ou null se nunca vendeu. */
  ultimaVenda: string | null;
  /** ISO da última entrada no estoque. */
  ultimaEntrada: string | null;
}

function diasEntre(deIso: string, ateIso: string): number {
  return Math.floor((Date.parse(ateIso.slice(0, 10)) - Date.parse(deIso.slice(0, 10))) / 86_400_000);
}

/**
 * Peças com estoque e sem venda há pelo menos `dias` dias. Conta a partir da última venda ou,
 * se nunca vendeu, da última entrada. Das paradas há mais tempo para as mais recentes.
 */
export function pecasParadas<T extends GiroProduto>(produtos: T[], hoje: string, dias = 60) {
  return produtos
    .filter((p) => p.saldo > 0)
    .map((p) => {
      const desde = p.ultimaVenda ?? p.ultimaEntrada;
      return { ...p, diasParado: desde ? diasEntre(desde, hoje) : null, valorParado: p.saldo * p.custoUnitario };
    })
    .filter((p) => p.diasParado === null || p.diasParado >= dias)
    .sort((a, b) => (b.diasParado ?? Infinity) - (a.diasParado ?? Infinity) || b.valorParado - a.valorParado);
}
