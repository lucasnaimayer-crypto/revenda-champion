// Venda: desconto rateado, comissões, lucro, parcelas e devolução.
// Portado de base44/shared/ln7.ts do SEVENIA, com as comissões vindas da configuração
// do revendedor em vez de "Queiroz" e "indicação" fixas no código.
// Como no SEVENIA, a comissão é calculada sobre o preço de tabela (antes do desconto).
import { porcentagem } from "./preco";

export interface LinhaVenda {
  produtoId: string;
  quantidade: number;
  /** Preço de venda por unidade, em centavos. */
  precoUnitario: number;
  /** Custo total por unidade (peça + frete + custos), em centavos. */
  custoUnitario: number;
}

export interface ComissaoVenda {
  nome: string;
  percentualBp: number;
}

export interface ItemCalculado extends LinhaVenda {
  subtotal: number;
  descontoRateado: number;
  custoTotal: number;
  comissao: number;
}

export interface CalculoVenda {
  itens: ItemCalculado[];
  pecas: number;
  totalBruto: number;
  desconto: number;
  totalLiquido: number;
  custoTotal: number;
  comissoes: { nome: string; percentualBp: number; valor: number }[];
  comissaoTotal: number;
  lucro: number;
  /** Lucro sobre o total líquido, em pontos-base. */
  margemBp: number;
}

/**
 * Distribui um total inteiro proporcionalmente aos pesos (maior resto), de modo que a soma
 * das partes seja exatamente o total.
 */
export function ratear(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (soma <= 0 || total === 0) return pesos.map(() => 0);
  const brutos = pesos.map((p) => (total * p) / soma);
  const partes = brutos.map(Math.floor);
  let resto = total - partes.reduce((a, b) => a + b, 0);
  const ordem = brutos.map((b, i) => ({ i, frac: b - Math.floor(b) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; resto > 0; k = (k + 1) % ordem.length, resto--) partes[ordem[k].i] += 1;
  return partes;
}

export function margemBp(lucro: number, base: number): number {
  return base > 0 ? Math.round((lucro * 10000) / base) : 0;
}

/** Calcula uma venda. Lança erro com mensagem amigável em entrada inválida. */
export function calcularVenda({
  linhas,
  desconto = 0,
  comissoes = [],
}: {
  linhas: LinhaVenda[];
  desconto?: number;
  comissoes?: ComissaoVenda[];
}): CalculoVenda {
  if (linhas.length === 0) throw new Error("Adicione ao menos uma peça.");
  if (!Number.isInteger(desconto) || desconto < 0) throw new Error("Desconto inválido.");
  const vistos = new Set<string>();
  for (const l of linhas) {
    if (vistos.has(l.produtoId)) throw new Error("A mesma peça aparece duas vezes na venda.");
    vistos.add(l.produtoId);
    if (!Number.isInteger(l.quantidade) || l.quantidade <= 0) throw new Error("A quantidade de cada peça precisa ser maior que zero.");
    if (!Number.isInteger(l.precoUnitario) || l.precoUnitario < 0) throw new Error("Preço de venda inválido.");
    if (!Number.isInteger(l.custoUnitario) || l.custoUnitario < 0) throw new Error("Custo inválido.");
  }

  const totalBruto = linhas.reduce((s, l) => s + l.precoUnitario * l.quantidade, 0);
  if (desconto > totalBruto) throw new Error("O desconto não pode ser maior que o total da venda.");
  const descontos = ratear(
    desconto,
    linhas.map((l) => l.precoUnitario * l.quantidade)
  );

  // Cada comissão é calculada por item e somada, para que a devolução de um item
  // reverta exatamente a parte dele.
  const porComissao = comissoes.map((c) => ({ nome: c.nome, percentualBp: c.percentualBp, valor: 0 }));
  const itens = linhas.map((l, k) => {
    const subtotal = l.precoUnitario * l.quantidade;
    let comissao = 0;
    porComissao.forEach((c) => {
      const v = porcentagem(subtotal, c.percentualBp);
      c.valor += v;
      comissao += v;
    });
    return { ...l, subtotal, descontoRateado: descontos[k], custoTotal: l.custoUnitario * l.quantidade, comissao };
  });

  const totalLiquido = totalBruto - desconto;
  const custoTotal = itens.reduce((s, i) => s + i.custoTotal, 0);
  const comissaoTotal = itens.reduce((s, i) => s + i.comissao, 0);
  const lucro = totalLiquido - custoTotal - comissaoTotal;
  return {
    itens,
    pecas: itens.reduce((s, i) => s + i.quantidade, 0),
    totalBruto,
    desconto,
    totalLiquido,
    custoTotal,
    comissoes: porComissao,
    comissaoTotal,
    lucro,
    margemBp: margemBp(lucro, totalLiquido),
  };
}

export interface Parcela {
  valor: number;
  /** AAAA-MM-DD */
  vencimento: string;
  recebido: boolean;
}

function somarMeses(dataIso: string, meses: number): string {
  const [a, m, d] = dataIso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  // Mantém o dia; em meses mais curtos usa o último dia (31/01 → 28/02).
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/**
 * Monta os recebimentos de uma venda: uma entrada opcional recebida na data da venda e o
 * restante em parcelas mensais iguais (os centavos que sobram vão para as primeiras).
 */
export function parcelar({
  total,
  dataVenda,
  entrada = 0,
  parcelas = 0,
  primeiroVencimento,
}: {
  total: number;
  dataVenda: string;
  entrada?: number;
  parcelas?: number;
  primeiroVencimento?: string;
}): Parcela[] {
  if (!Number.isInteger(entrada) || entrada < 0 || entrada > total) throw new Error("A entrada não pode ser maior que o total da venda.");
  if (!Number.isInteger(parcelas) || parcelas < 0 || parcelas > 24) throw new Error("Escolha de 1 a 24 parcelas.");
  const restante = total - entrada;
  if (restante > 0 && parcelas === 0) throw new Error("Informe em quantas parcelas o restante será pago.");
  const lista: Parcela[] = [];
  if (entrada > 0) lista.push({ valor: entrada, vencimento: dataVenda, recebido: true });
  if (restante > 0) {
    if (primeiroVencimento && primeiroVencimento < dataVenda) throw new Error("O primeiro vencimento não pode ser antes da venda.");
    // Sem primeiro vencimento, a primeira parcela vence um mês depois da venda. Cada vencimento
    // é contado a partir da mesma base, para o dia 31 não virar 28 para sempre depois de fevereiro.
    const base = primeiroVencimento || dataVenda;
    const deslocamento = primeiroVencimento ? 0 : 1;
    ratear(restante, Array(parcelas).fill(1)).forEach((valor, k) =>
      lista.push({ valor, vencimento: somarMeses(base, deslocamento + k), recebido: false })
    );
  }
  return lista;
}

export interface ItemVendido {
  quantidade: number;
  quantidadeDevolvida: number;
  subtotal: number;
  descontoRateado: number;
  custoUnitario: number;
  comissao: number;
}

/**
 * Valores a reverter quando `quantidade` unidades de um item voltam. A fatia é acumulada, então
 * a soma de várias devoluções parciais chega exatamente ao valor do item.
 * Espelha a conta feita no banco por public.devolver_venda.
 */
export function calcularDevolucaoItem(item: ItemVendido, quantidade: number) {
  const restante = item.quantidade - item.quantidadeDevolvida;
  if (!Number.isInteger(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida.");
  if (quantidade > restante) throw new Error(`Só restam ${restante} unidade(s) deste item para devolver.`);
  const fatia = (valor: number) => {
    const acumulado = (q: number) => Math.round((valor * q) / item.quantidade);
    return acumulado(item.quantidadeDevolvida + quantidade) - acumulado(item.quantidadeDevolvida);
  };
  return {
    quantidade,
    receita: fatia(item.subtotal - item.descontoRateado),
    custo: item.custoUnitario * quantidade,
    comissao: fatia(item.comissao),
  };
}

export interface VendaGravada {
  status: "concluida" | "parcialmente_devolvida" | "devolvida" | "cancelada";
  pecas: number;
  totalLiquido: number;
  custoTotal: number;
  comissaoTotal: number;
  devolvidoPecas: number;
  devolvidoReceita: number;
  devolvidoCusto: number;
  comissaoRevertida: number;
}

/** Resultado da venda já descontando devoluções e cancelamento. */
export function resultadoDaVenda(v: VendaGravada) {
  const comissoes = v.comissaoTotal - v.comissaoRevertida;
  if (v.status === "cancelada") {
    // Comissão mantida no cancelamento continua sendo despesa.
    return { faturamento: 0, custo: 0, comissoes, lucro: -comissoes, pecas: 0 };
  }
  const faturamento = v.totalLiquido - v.devolvidoReceita;
  const custo = v.custoTotal - v.devolvidoCusto;
  return { faturamento, custo, comissoes, lucro: faturamento - custo - comissoes, pecas: v.pecas - v.devolvidoPecas };
}

export const FORMAS_PAGAMENTO = [
  { valor: "pix", rotulo: "Pix" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "cartao_credito", rotulo: "Cartão de crédito" },
  { valor: "cartao_debito", rotulo: "Cartão de débito" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "crediario", rotulo: "Crediário (fiado)" },
  { valor: "outro", rotulo: "Outro" },
] as const;

export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number]["valor"];

export function rotuloFormaPagamento(valor: string): string {
  return FORMAS_PAGAMENTO.find((f) => f.valor === valor)?.rotulo ?? valor;
}
