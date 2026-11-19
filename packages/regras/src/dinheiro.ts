// Conversões entre centavos e texto em reais (pt-BR).

const formatador = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarReais(centavos: number): string {
  return formatador.format((Number(centavos) || 0) / 100);
}

/** Lê "R$ 1.234,56", "1234,56" ou "1234.56" e devolve centavos; null se não for um valor. */
export function lerReais(texto: string): number | null {
  const limpo = String(texto ?? "")
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .trim();
  if (!limpo) return null;
  let normal: string;
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(limpo) || /^\d+,\d{1,2}$/.test(limpo)) {
    normal = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+(\.\d{1,2})?$/.test(limpo)) {
    normal = limpo;
  } else {
    return null;
  }
  const valor = Math.round(Number(normal) * 100);
  return Number.isFinite(valor) ? valor : null;
}

export function bpParaPercentual(bp: number): number {
  return (Number(bp) || 0) / 100;
}

export function percentualParaBp(percentual: number): number {
  return Math.round((Number(percentual) || 0) * 100);
}
