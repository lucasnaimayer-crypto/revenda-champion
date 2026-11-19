import "server-only";
import type { RegrasIniciais } from "@/componentes/regras/FormRegras";
import type { RegrasDoRevendedor } from "./regras";

export function paraFormulario(r: RegrasDoRevendedor): RegrasIniciais {
  return {
    freteBp: r.regra.freteBp,
    markupBp: r.regra.markupBp,
    arredondamento: r.regra.arredondamento,
    custos: r.custos.map((c) => ({ id: c.id, nome: c.nome, modo: c.modo, valor: c.valor, aplicaATodos: c.aplicaATodos })),
    comissoes: r.comissoes.map((c) => ({ id: c.id, nome: c.nome, percentualBp: c.percentualBp, ligadaPorPadrao: c.ligadaPorPadrao })),
  };
}
