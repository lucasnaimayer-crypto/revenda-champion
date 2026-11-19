// Cálculo de preço de uma peça a partir das regras do revendedor.
// Dinheiro em centavos (inteiros). Percentuais em pontos-base: 10000 = 100%.
// Portado e generalizado de base44/shared/ln7Pedido.ts do SEVENIA: o que lá era fixo
// (frete 5%, sacola R$ 4,14, markup 100%, duas comissões de 10%) aqui vem da configuração.

export type Arredondamento = "nenhum" | "inteiro" | "final_90";

export interface RegraPreco {
  /** Frete sobre o custo da peça, em pontos-base. */
  freteBp: number;
  /** Markup sobre o custo total (peça + frete + custos), em pontos-base. 10000 = vende pelo dobro. */
  markupBp: number;
  arredondamento: Arredondamento;
}

export type ModoCusto = "fixo" | "percentual";

export interface CustoTipo {
  id: string;
  nome: string;
  /** fixo: valor em centavos por peça. percentual: pontos-base sobre o custo da peça. */
  modo: ModoCusto;
  valor: number;
  /** true: entra em todos os produtos. false: só nos produtos que o incluírem. */
  aplicaATodos: boolean;
}

export interface Comissao {
  nome: string;
  percentualBp: number;
}

export interface EntradaPeca {
  custo: number;
  quantidade?: number;
  regra: RegraPreco;
  custos?: CustoTipo[];
  /**
   * Ajustes do produto, por id do tipo de custo: um número troca o valor só neste produto
   * (e inclui custos que não se aplicam a todos); null tira o custo deste produto.
   */
  ajustesDoProduto?: Record<string, number | null>;
  comissoes?: Comissao[];
  /** Preço de venda definido à mão; quando ausente, vem do markup. */
  precoManual?: number | null;
}

export interface LinhaValor {
  nome: string;
  valor: number;
}

export interface ResultadoPeca {
  quantidade: number;
  custoPeca: number;
  frete: number;
  custos: LinhaValor[];
  /** Peça + frete + custos: quanto a peça custa de verdade, por unidade. */
  custoTotal: number;
  precoVenda: number;
  comissoes: LinhaValor[];
  lucro: number;
  /** Lucro sobre o preço de venda, em pontos-base. */
  margemBp: number;
  totais: {
    custoPeca: number;
    custoTotal: number;
    venda: number;
    comissoes: number;
    lucro: number;
  };
}

export const REGRA_INICIAL: RegraPreco = Object.freeze({
  freteBp: 0,
  markupBp: 10000,
  arredondamento: "nenhum",
}) as RegraPreco;

function inteiroPositivo(v: unknown): number {
  const n = Math.round(Number(v) || 0);
  return n > 0 ? n : 0;
}

export function porcentagem(valor: number, bp: number): number {
  return Math.round((valor * bp) / 10000);
}

export function arredondar(centavos: number, modo: Arredondamento): number {
  if (centavos <= 0) return 0;
  if (modo === "inteiro") return Math.ceil(centavos / 100) * 100;
  if (modo === "final_90") {
    // Próximo valor terminado em ,90 que não fique abaixo do calculado.
    const reais = Math.floor(centavos / 100);
    const candidato = reais * 100 + 90;
    return candidato >= centavos ? candidato : candidato + 100;
  }
  return centavos;
}

export function custosAplicados(
  custoPeca: number,
  custos: CustoTipo[] = [],
  ajustes: Record<string, number | null> = {}
): LinhaValor[] {
  const linhas: LinhaValor[] = [];
  for (const tipo of custos) {
    const temAjuste = Object.prototype.hasOwnProperty.call(ajustes, tipo.id);
    const ajuste = temAjuste ? ajustes[tipo.id] : undefined;
    if (ajuste === null) continue;
    if (!tipo.aplicaATodos && !temAjuste) continue;
    const base = typeof ajuste === "number" ? ajuste : tipo.valor;
    const valor = tipo.modo === "percentual" ? porcentagem(custoPeca, inteiroPositivo(base)) : inteiroPositivo(base);
    if (valor > 0) linhas.push({ nome: tipo.nome, valor });
  }
  return linhas;
}

export function calcularPeca(entrada: EntradaPeca): ResultadoPeca {
  const quantidade = Math.max(1, Math.round(Number(entrada.quantidade) || 1));
  const custoPeca = inteiroPositivo(entrada.custo);
  const frete = porcentagem(custoPeca, inteiroPositivo(entrada.regra.freteBp));
  const custos = custosAplicados(custoPeca, entrada.custos, entrada.ajustesDoProduto);
  const custoTotal = custoPeca + frete + custos.reduce((s, c) => s + c.valor, 0);

  const manual = entrada.precoManual == null ? null : inteiroPositivo(entrada.precoManual);
  const precoVenda =
    manual && manual > 0
      ? manual
      : arredondar(
          Math.round(custoTotal * (1 + inteiroPositivo(entrada.regra.markupBp) / 10000)),
          entrada.regra.arredondamento
        );

  const comissoes = (entrada.comissoes ?? []).map((c) => ({
    nome: c.nome,
    valor: porcentagem(precoVenda, inteiroPositivo(c.percentualBp)),
  }));
  const totalComissoes = comissoes.reduce((s, c) => s + c.valor, 0);
  const lucro = precoVenda - custoTotal - totalComissoes;
  const margemBp = precoVenda > 0 ? Math.round((lucro * 10000) / precoVenda) : 0;

  return {
    quantidade,
    custoPeca,
    frete,
    custos,
    custoTotal,
    precoVenda,
    comissoes,
    lucro,
    margemBp,
    totais: {
      custoPeca: custoPeca * quantidade,
      custoTotal: custoTotal * quantidade,
      venda: precoVenda * quantidade,
      comissoes: totalComissoes * quantidade,
      lucro: lucro * quantidade,
    },
  };
}

export interface Resumo {
  pecas: number;
  custoPeca: number;
  custoTotal: number;
  venda: number;
  comissoes: number;
  lucro: number;
  margemBp: number;
}

export function resumir(resultados: ResultadoPeca[]): Resumo {
  const r = resultados.reduce(
    (t, p) => ({
      pecas: t.pecas + p.quantidade,
      custoPeca: t.custoPeca + p.totais.custoPeca,
      custoTotal: t.custoTotal + p.totais.custoTotal,
      venda: t.venda + p.totais.venda,
      comissoes: t.comissoes + p.totais.comissoes,
      lucro: t.lucro + p.totais.lucro,
    }),
    { pecas: 0, custoPeca: 0, custoTotal: 0, venda: 0, comissoes: 0, lucro: 0 }
  );
  return { ...r, margemBp: r.venda > 0 ? Math.round((r.lucro * 10000) / r.venda) : 0 };
}
