// Datas no fuso de Brasília. Datas de negócio (venda, vencimento) são texto AAAA-MM-DD.
const FUSO = "America/Sao_Paulo";

export function hojeISO(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** "2026-11-19" → "19/11/2026", sem passar por fuso. */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function mesISO(agora = new Date()): string {
  return hojeISO(agora).slice(0, 7);
}

/** Primeiro e último dia do mês "AAAA-MM". */
export function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const nome = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

export function somarMesISO(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Link do WhatsApp para um telefone brasileiro, ou null se o número não parecer válido. */
export function linkWhatsapp(telefone: string | null | undefined): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return `https://wa.me/55${digitos}`;
  if (digitos.length >= 12 && digitos.length <= 13 && digitos.startsWith("55")) return `https://wa.me/${digitos}`;
  return null;
}
