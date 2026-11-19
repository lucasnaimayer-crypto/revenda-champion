"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { calcularPeca, formatarReais, lerReais, type CustoTipo, type RegraPreco } from "@revenda/regras";
import { ajustarEstoque, criarProduto, salvarProduto, type Resultado } from "@/app/(app)/estoque/acoes";
import { Aviso, Botao, Campo, classeCampo } from "@/componentes/ui";

export function FormAjuste({ produtoId, saldo }: { produtoId: string; saldo: number }) {
  const [estado, acao, ocupado] = useActionState<Resultado, FormData>(ajustarEstoque, {});
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="produto_id" value={produtoId} />
      <div className="grid grid-cols-[120px_1fr] gap-2">
        <Campo rotulo="Contei" name="contado" type="number" min={0} defaultValue={saldo} required />
        <Campo rotulo="Motivo" name="motivo" required maxLength={200} placeholder="Contagem, perda, brinde…" />
      </div>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {estado.ok && <Aviso tipo="ok">{estado.ok}</Aviso>}
      <Botao variante="secundario" type="submit" disabled={ocupado}>
        {ocupado ? "Ajustando…" : "Ajustar estoque"}
      </Botao>
    </form>
  );
}

export function FormNovoProduto() {
  const [estado, acao, ocupado] = useActionState<Resultado, FormData>(criarProduto, {});
  return (
    <form action={acao} className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr_1fr_auto] sm:items-end">
      <Campo rotulo="Código" name="codigo" required maxLength={40} />
      <Campo rotulo="Descrição" name="descricao" maxLength={200} />
      <Campo rotulo="Custo (R$)" name="custo" required inputMode="decimal" placeholder="0,00" />
      <Campo rotulo="Quantidade" name="quantidade" type="number" min={0} defaultValue={1} />
      <Botao type="submit" disabled={ocupado}>
        {ocupado ? "Salvando…" : "Adicionar"}
      </Botao>
      {estado.erro && (
        <div className="sm:col-span-5">
          <Aviso>{estado.erro}</Aviso>
        </div>
      )}
    </form>
  );
}

type Modo = "padrao" | "nao" | "valor";

interface Props {
  produtoId: string;
  custo: number;
  descricao: string | null;
  precoManual: number | null;
  regra: RegraPreco;
  tipos: CustoTipo[];
  ajustes: Record<string, number | null>;
}

function valorDoTipo(t: CustoTipo, v: number) {
  return t.modo === "percentual" ? `${(v / 100).toLocaleString("pt-BR")}%` : formatarReais(v);
}

/** Preço à mão e custos próprios do produto, com o resultado calculado na hora. */
export function FormProduto({ produtoId, custo, descricao, precoManual, regra, tipos, ajustes }: Props) {
  const [desc, setDesc] = useState(descricao ?? "");
  const [precoTexto, setPrecoTexto] = useState(precoManual != null ? (precoManual / 100).toFixed(2).replace(".", ",") : "");
  const [modos, setModos] = useState<Record<string, { modo: Modo; texto: string }>>(() =>
    Object.fromEntries(
      tipos.map((t) => {
        const tem = Object.prototype.hasOwnProperty.call(ajustes, t.id);
        const v = ajustes[t.id];
        const modo: Modo = !tem ? (t.aplicaATodos ? "padrao" : "nao") : v === null ? "nao" : "valor";
        const texto = typeof v === "number" ? (t.modo === "percentual" ? String(v / 100).replace(".", ",") : (v / 100).toFixed(2).replace(".", ",")) : "";
        return [t.id, { modo, texto }];
      })
    )
  );
  const [estado, setEstado] = useState<Resultado>({});
  const [ocupado, iniciar] = useTransition();

  function lerValor(t: CustoTipo, texto: string): number | null {
    if (t.modo === "percentual") {
      const n = Number(texto.replace(",", "."));
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
    }
    return lerReais(texto);
  }

  const precoManualLido = precoTexto.trim() ? lerReais(precoTexto) : null;
  const ajustesAtuais = useMemo(() => {
    const a: Record<string, number | null> = {};
    for (const t of tipos) {
      const m = modos[t.id];
      if (m.modo === "nao") a[t.id] = null;
      else if (m.modo === "valor") a[t.id] = lerValor(t, m.texto) ?? 0;
    }
    return a;
  }, [modos, tipos]);
  const calc = calcularPeca({ custo, regra, custos: tipos, ajustesDoProduto: ajustesAtuais, precoManual: precoManualLido });

  function salvar() {
    setEstado({});
    if (precoTexto.trim() && precoManualLido === null) return setEstado({ erro: "Preço de venda inválido." });
    iniciar(async () => {
      try {
        const r = await salvarProduto({
          produtoId,
          descricao: desc.trim() || null,
          precoManual: precoManualLido,
          custos: tipos.map((t) => {
            const m = modos[t.id];
            // "Padrão" de um custo que não vale para todos é o mesmo que não cobrar.
            const modo: Modo = m.modo === "nao" && !t.aplicaATodos ? "padrao" : m.modo;
            return { custoTipoId: t.id, modo, valor: m.modo === "valor" ? lerValor(t, m.texto) ?? 0 : null };
          }),
        });
        setEstado(r);
      } catch {
        setEstado({ erro: "Sem conexão. Tente de novo." });
      }
    });
  }

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Descrição</span>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} className={classeCampo} />
      </label>
      {tipos.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Custos deste produto</legend>
          {tipos.map((t) => {
            const m = modos[t.id];
            return (
              <div key={t.id} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
                <span>
                  {t.nome} <span className="text-xs text-zinc-500">(padrão {valorDoTipo(t, t.valor)}{t.aplicaATodos ? "" : ", só em alguns produtos"})</span>
                </span>
                <span className="flex items-center gap-2">
                  <select
                    value={m.modo}
                    onChange={(e) => setModos((x) => ({ ...x, [t.id]: { ...x[t.id], modo: e.target.value as Modo } }))}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
                  >
                    {t.aplicaATodos && <option value="padrao">Padrão</option>}
                    <option value="nao">Não cobrar</option>
                    <option value="valor">{t.aplicaATodos ? "Outro valor" : "Cobrar"}</option>
                  </select>
                  {m.modo === "valor" && (
                    <input
                      value={m.texto}
                      onChange={(e) => setModos((x) => ({ ...x, [t.id]: { ...x[t.id], texto: e.target.value } }))}
                      inputMode="decimal"
                      placeholder={t.modo === "percentual" ? "%" : "R$"}
                      className="w-20 rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                    />
                  )}
                </span>
              </div>
            );
          })}
        </fieldset>
      )}
      <label className="block space-y-1">
        <span className="text-sm font-medium">Preço de venda definido à mão (R$)</span>
        <input value={precoTexto} onChange={(e) => setPrecoTexto(e.target.value)} inputMode="decimal" placeholder="Vazio: usa o markup" className={classeCampo} />
      </label>
      <dl className="space-y-1 rounded-lg bg-zinc-50 p-3 text-sm">
        <div className="flex justify-between">
          <dt>Peça</dt>
          <dd className="tabular-nums">{formatarReais(calc.custoPeca)}</dd>
        </div>
        {calc.frete > 0 && (
          <div className="flex justify-between">
            <dt>Frete</dt>
            <dd className="tabular-nums">{formatarReais(calc.frete)}</dd>
          </div>
        )}
        {calc.custos.map((c) => (
          <div key={c.nome} className="flex justify-between">
            <dt>{c.nome}</dt>
            <dd className="tabular-nums">{formatarReais(c.valor)}</dd>
          </div>
        ))}
        <div className="flex justify-between font-medium">
          <dt>Custo total</dt>
          <dd className="tabular-nums">{formatarReais(calc.custoTotal)}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt>Preço de venda</dt>
          <dd className="tabular-nums">{formatarReais(calc.precoVenda)}</dd>
        </div>
        <div className="flex justify-between text-emerald-700">
          <dt>Lucro por peça (sem comissões)</dt>
          <dd className="tabular-nums">{formatarReais(calc.precoVenda - calc.custoTotal)}</dd>
        </div>
      </dl>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {estado.ok && <Aviso tipo="ok">{estado.ok}</Aviso>}
      <Botao type="button" onClick={salvar} disabled={ocupado}>
        {ocupado ? "Salvando…" : "Salvar produto"}
      </Botao>
    </div>
  );
}
