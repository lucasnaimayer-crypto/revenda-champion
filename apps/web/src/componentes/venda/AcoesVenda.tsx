"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calcularDevolucaoItem, formatarReais } from "@revenda/regras";
import { cancelarVenda, devolverVenda, marcarRecebimento, type Resultado } from "@/app/(app)/vendas/acoes";
import { Aviso, Botao, classeCampo } from "@/componentes/ui";

function textoReembolso(r: Resultado): string | null {
  if (!r.aviso?.startsWith("reembolso:")) return null;
  return `Devolva ${formatarReais(Number(r.aviso.slice("reembolso:".length)))} ao cliente: esse valor já tinha sido pago.`;
}

/** Botão de receber ou desfazer uma parcela. */
export function BotaoParcela({ id, recebido, hoje }: { id: string; recebido: boolean; hoje: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={ocupado}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            try {
              const r = await marcarRecebimento(id, recebido ? null : hoje);
              if (r.erro) setErro(r.erro);
              else router.refresh();
            } catch {
              setErro("Sem conexão. Tente de novo.");
            }
          })
        }
        className={`rounded-lg px-3 py-1 text-xs font-medium disabled:opacity-50 ${recebido ? "text-zinc-500 hover:text-zinc-900" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
      >
        {ocupado ? "…" : recebido ? "Desfazer" : "Recebi"}
      </button>
      {erro && <span className="text-xs text-red-700">{erro}</span>}
    </span>
  );
}

export interface ItemDevolvivel {
  id: string;
  codigo: string;
  quantidade: number;
  quantidadeDevolvida: number;
  subtotal: number;
  descontoRateado: number;
  custoUnitario: number;
  comissao: number;
}

export function DevolverVenda({ vendaId, itens, hoje, dataVenda, temComissao }: { vendaId: string; itens: ItemDevolvivel[]; hoje: string; dataVenda: string; temComissao: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [motivo, setMotivo] = useState("");
  const [data, setData] = useState(hoje);
  const [reverter, setReverter] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  let receita = 0;
  for (const i of itens) {
    const q = qtd[i.id] ?? 0;
    if (q > 0 && q <= i.quantidade - i.quantidadeDevolvida) receita += calcularDevolucaoItem(i, q).receita;
  }

  if (!aberto) {
    return (
      <div className="space-y-2">
        {ok && <Aviso tipo="ok">{ok}</Aviso>}
        <Botao variante="secundario" type="button" onClick={() => setAberto(true)}>
          Devolver peças
        </Botao>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <h3 className="font-semibold">Devolver peças</h3>
      <ul className="space-y-2">
        {itens
          .filter((i) => i.quantidade > i.quantidadeDevolvida)
          .map((i) => {
            const resta = i.quantidade - i.quantidadeDevolvida;
            return (
              <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-mono">{i.codigo}</span>
                <span className="flex items-center gap-2 text-zinc-500">
                  <input
                    type="number"
                    min={0}
                    max={resta}
                    value={qtd[i.id] ?? 0}
                    onChange={(e) => setQtd((q) => ({ ...q, [i.id]: Math.max(0, Math.min(resta, Number(e.target.value) || 0)) }))}
                    className="w-16 rounded-lg border border-zinc-300 px-2 py-1 tabular-nums"
                  />
                  de {resta}
                </span>
              </li>
            );
          })}
      </ul>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Motivo (ex.: defeito, troca)" className={classeCampo} />
        <input type="date" value={data} min={dataVenda} max={hoje} onChange={(e) => setData(e.target.value)} className={classeCampo} />
      </div>
      {temComissao && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={reverter} onChange={(e) => setReverter(e.target.checked)} />
          Tirar a comissão das peças devolvidas
        </label>
      )}
      <p className="text-sm text-zinc-600">
        Valor devolvido: <strong className="tabular-nums">{formatarReais(receita)}</strong>. Sai primeiro das parcelas que ainda não foram pagas.
      </p>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex gap-2">
        <Botao
          type="button"
          disabled={ocupado || !Object.values(qtd).some((q) => q > 0) || !motivo.trim()}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              try {
                const r = await devolverVenda(
                  vendaId,
                  Object.entries(qtd).map(([itemId, quantidade]) => ({ itemId, quantidade })),
                  motivo,
                  data,
                  temComissao ? reverter : false
                );
                if (r.erro) return setErro(r.erro);
                setOk(textoReembolso(r) ?? "Devolução registrada. As peças voltaram ao estoque.");
                setAberto(false);
                setQtd({});
                router.refresh();
              } catch {
                setErro("Sem conexão. Tente de novo.");
              }
            })
          }
        >
          {ocupado ? "Registrando…" : "Confirmar devolução"}
        </Botao>
        <Botao variante="secundario" type="button" onClick={() => setAberto(false)}>
          Voltar
        </Botao>
      </div>
    </div>
  );
}

export function CancelarVenda({ vendaId, temComissao }: { vendaId: string; temComissao: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [reverter, setReverter] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  if (!aberto) {
    return (
      <div className="space-y-2">
        {ok && <Aviso tipo="ok">{ok}</Aviso>}
        <Botao variante="perigo" type="button" onClick={() => setAberto(true)}>
          Cancelar venda
        </Botao>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-red-200 bg-white p-4">
      <h3 className="font-semibold">Cancelar a venda inteira</h3>
      <p className="text-sm text-zinc-600">Todas as peças voltam ao estoque e as parcelas que faltam são canceladas. O histórico fica guardado.</p>
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Motivo do cancelamento" className={classeCampo} />
      {temComissao && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={reverter} onChange={(e) => setReverter(e.target.checked)} />
          Tirar as comissões desta venda
        </label>
      )}
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex gap-2">
        <Botao
          variante="perigo"
          type="button"
          disabled={ocupado || !motivo.trim()}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              try {
                const r = await cancelarVenda(vendaId, motivo, temComissao ? reverter : false);
                if (r.erro) return setErro(r.erro);
                setOk(textoReembolso(r) ?? "Venda cancelada. As peças voltaram ao estoque.");
                setAberto(false);
                router.refresh();
              } catch {
                setErro("Sem conexão. Tente de novo.");
              }
            })
          }
        >
          {ocupado ? "Cancelando…" : "Confirmar cancelamento"}
        </Botao>
        <Botao variante="secundario" type="button" onClick={() => setAberto(false)}>
          Voltar
        </Botao>
      </div>
    </div>
  );
}
