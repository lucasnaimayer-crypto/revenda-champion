"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { calcularPeca, formatarReais, lerReais, type Arredondamento } from "@revenda/regras";
import { Aviso, Botao, Cartao, classeCampo } from "@/componentes/ui";
import { salvarRegras, type EstadoRegras } from "./acoes";

export interface RegrasIniciais {
  freteBp: number;
  markupBp: number;
  arredondamento: Arredondamento;
  custos: { id?: string; nome: string; modo: "fixo" | "percentual"; valor: number; aplicaATodos: boolean }[];
  comissoes: { id?: string; nome: string; percentualBp: number; ligadaPorPadrao: boolean }[];
}

// Campos em texto para o usuário digitar à vontade ("4,14", "5"); convertidos só ao salvar.
interface LinhaCusto {
  chave: string;
  id?: string;
  nome: string;
  modo: "fixo" | "percentual";
  valor: string;
  aplicaATodos: boolean;
}
interface LinhaComissao {
  chave: string;
  id?: string;
  nome: string;
  percentual: string;
  ligadaPorPadrao: boolean;
}

const SUGESTOES_CUSTO = ["Embalagem", "Sacola", "Estojo", "Etiqueta", "Gravação", "Flanela"];

function paraTexto(n: number): string {
  return (n / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function lerNumero(s: string): number {
  return lerReais(s.replace("%", "")) ?? 0;
}
let sequencia = 0;
const novaChave = () => `n${++sequencia}`;

export default function FormRegras({ inicial, destino }: { inicial: RegrasIniciais; destino?: string }) {
  const router = useRouter();
  const [frete, setFrete] = useState(paraTexto(inicial.freteBp));
  const [markup, setMarkup] = useState(paraTexto(inicial.markupBp));
  const [arredondamento, setArredondamento] = useState<Arredondamento>(inicial.arredondamento);
  const [custos, setCustos] = useState<LinhaCusto[]>(() =>
    inicial.custos.map((c) => ({ chave: novaChave(), id: c.id, nome: c.nome, modo: c.modo, valor: paraTexto(c.valor), aplicaATodos: c.aplicaATodos }))
  );
  const [comissoes, setComissoes] = useState<LinhaComissao[]>(() =>
    inicial.comissoes.map((c) => ({ chave: novaChave(), id: c.id, nome: c.nome, percentual: paraTexto(c.percentualBp), ligadaPorPadrao: c.ligadaPorPadrao }))
  );
  const [exemplo, setExemplo] = useState("150,00");
  const [estado, acao, salvando] = useActionState<EstadoRegras, FormData>(salvarRegras, {});

  useEffect(() => {
    if (estado.ok && destino) router.push(destino);
  }, [estado.ok, destino, router]);

  const dados = useMemo(
    () => ({
      freteBp: lerNumero(frete),
      markupBp: lerNumero(markup),
      arredondamento,
      custos: custos.map((c) => ({ id: c.id, nome: c.nome, modo: c.modo, valor: lerNumero(c.valor), aplicaATodos: c.aplicaATodos })),
      comissoes: comissoes.map((c) => ({ id: c.id, nome: c.nome, percentualBp: lerNumero(c.percentual), ligadaPorPadrao: c.ligadaPorPadrao })),
    }),
    [frete, markup, arredondamento, custos, comissoes]
  );

  const previa = useMemo(
    () =>
      calcularPeca({
        custo: lerReais(exemplo) ?? 0,
        regra: dados,
        custos: dados.custos.map((c, i) => ({ ...c, id: String(i) })),
        comissoes: dados.comissoes.filter((c) => c.ligadaPorPadrao),
      }),
    [dados, exemplo]
  );

  const mudarCusto = (chave: string, parte: Partial<LinhaCusto>) =>
    setCustos((l) => l.map((c) => (c.chave === chave ? { ...c, ...parte } : c)));
  const mudarComissao = (chave: string, parte: Partial<LinhaComissao>) =>
    setComissoes((l) => l.map((c) => (c.chave === chave ? { ...c, ...parte } : c)));

  return (
    <form action={acao} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <input type="hidden" name="dados" value={JSON.stringify(dados)} />
      <div className="space-y-6">
        <Cartao>
          <h2 className="font-semibold">Preço de venda</h2>
          <p className="mb-4 text-sm text-zinc-500">O preço sai do custo total da peça mais o seu markup.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Frete (% do custo)</span>
              <input className={classeCampo} inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Markup (%)</span>
              <input className={classeCampo} inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} />
              <span className="block text-xs text-zinc-500">100% = vende pelo dobro do custo total.</span>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Arredondar preço</span>
              <select className={classeCampo} value={arredondamento} onChange={(e) => setArredondamento(e.target.value as Arredondamento)}>
                <option value="nenhum">Não arredondar</option>
                <option value="inteiro">Para o real cheio</option>
                <option value="final_90">Terminar em ,90</option>
              </select>
            </label>
          </div>
        </Cartao>

        <Cartao>
          <h2 className="font-semibold">Seus custos por peça</h2>
          <p className="mb-4 text-sm text-zinc-500">
            Tudo o que você gasta além da peça. Valor fixo em reais ou percentual sobre o custo. Desmarque &quot;todos os produtos&quot; para
            usar só em produtos escolhidos.
          </p>
          <div className="space-y-3">
            {custos.map((c) => (
              <div key={c.chave} className="grid grid-cols-[1fr_7rem_6rem_auto] items-center gap-2 sm:grid-cols-[1fr_8rem_7rem_auto_auto]">
                <input className={classeCampo} placeholder="Nome" value={c.nome} onChange={(e) => mudarCusto(c.chave, { nome: e.target.value })} />
                <select className={classeCampo} value={c.modo} onChange={(e) => mudarCusto(c.chave, { modo: e.target.value as LinhaCusto["modo"] })}>
                  <option value="fixo">R$ fixo</option>
                  <option value="percentual">% do custo</option>
                </select>
                <input className={classeCampo} inputMode="decimal" value={c.valor} onChange={(e) => mudarCusto(c.chave, { valor: e.target.value })} />
                <label className="col-span-3 flex items-center gap-2 text-xs text-zinc-600 sm:col-span-1">
                  <input type="checkbox" checked={c.aplicaATodos} onChange={(e) => mudarCusto(c.chave, { aplicaATodos: e.target.checked })} />
                  todos os produtos
                </label>
                <button type="button" aria-label={`Remover ${c.nome}`} className="text-sm text-zinc-400 hover:text-red-600" onClick={() => setCustos((l) => l.filter((x) => x.chave !== c.chave))}>
                  remover
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGESTOES_CUSTO.filter((s) => !custos.some((c) => c.nome.toLowerCase() === s.toLowerCase())).map((s) => (
              <button
                key={s}
                type="button"
                className="rounded-full border border-dashed border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:border-zinc-500"
                onClick={() => setCustos((l) => [...l, { chave: novaChave(), nome: s, modo: "fixo", valor: "0", aplicaATodos: true }])}
              >
                + {s}
              </button>
            ))}
            <button
              type="button"
              className="rounded-full border border-dashed border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:border-zinc-500"
              onClick={() => setCustos((l) => [...l, { chave: novaChave(), nome: "", modo: "fixo", valor: "0", aplicaATodos: true }])}
            >
              + Outro custo
            </button>
          </div>
        </Cartao>

        <Cartao>
          <h2 className="font-semibold">Comissões</h2>
          <p className="mb-4 text-sm text-zinc-500">Percentual sobre o preço de venda, por exemplo para quem indica ou vende por você.</p>
          <div className="space-y-3">
            {comissoes.map((c) => (
              <div key={c.chave} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2 sm:grid-cols-[1fr_6rem_auto_auto]">
                <input className={classeCampo} placeholder="Nome" value={c.nome} onChange={(e) => mudarComissao(c.chave, { nome: e.target.value })} />
                <input className={classeCampo} inputMode="decimal" value={c.percentual} onChange={(e) => mudarComissao(c.chave, { percentual: e.target.value })} />
                <label className="col-span-2 flex items-center gap-2 text-xs text-zinc-600 sm:col-span-1">
                  <input type="checkbox" checked={c.ligadaPorPadrao} onChange={(e) => mudarComissao(c.chave, { ligadaPorPadrao: e.target.checked })} />
                  sempre
                </label>
                <button type="button" className="text-sm text-zinc-400 hover:text-red-600" onClick={() => setComissoes((l) => l.filter((x) => x.chave !== c.chave))}>
                  remover
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-4 rounded-full border border-dashed border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:border-zinc-500"
            onClick={() => setComissoes((l) => [...l, { chave: novaChave(), nome: "", percentual: "10", ligadaPorPadrao: false }])}
          >
            + Comissão
          </button>
        </Cartao>
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Cartao>
          <h2 className="font-semibold">Como fica uma peça</h2>
          <label className="mt-3 block space-y-1">
            <span className="text-sm text-zinc-600">Custo no catálogo (R$)</span>
            <input className={classeCampo} inputMode="decimal" value={exemplo} onChange={(e) => setExemplo(e.target.value)} />
          </label>
          <dl className="mt-4 space-y-1.5 text-sm">
            <Linha nome="Peça" valor={previa.custoPeca} />
            {previa.frete > 0 && <Linha nome="Frete" valor={previa.frete} />}
            {previa.custos.map((c) => (
              <Linha key={c.nome} nome={c.nome} valor={c.valor} />
            ))}
            <Linha nome="Custo total" valor={previa.custoTotal} forte />
            <Linha nome="Preço de venda" valor={previa.precoVenda} forte />
            {previa.comissoes.map((c) => (
              <Linha key={c.nome} nome={`Comissão ${c.nome}`} valor={-c.valor} />
            ))}
            <div className="flex justify-between border-t border-zinc-200 pt-2 font-semibold text-emerald-700">
              <dt>Lucro</dt>
              <dd>
                {formatarReais(previa.lucro)} <span className="font-normal text-zinc-500">({(previa.margemBp / 100).toFixed(1)}%)</span>
              </dd>
            </div>
          </dl>
        </Cartao>
        {estado.erro && <Aviso>{estado.erro}</Aviso>}
        {estado.ok && !destino && <Aviso tipo="ok">Regras salvas.</Aviso>}
        <Botao type="submit" disabled={salvando} className="w-full">
          {salvando ? "Salvando…" : destino ? "Salvar e continuar" : "Salvar"}
        </Botao>
      </div>
    </form>
  );
}

function Linha({ nome, valor, forte }: { nome: string; valor: number; forte?: boolean }) {
  return (
    <div className={`flex justify-between ${forte ? "font-medium text-zinc-900" : "text-zinc-600"}`}>
      <dt>{nome}</dt>
      <dd>{formatarReais(valor)}</dd>
    </div>
  );
}
