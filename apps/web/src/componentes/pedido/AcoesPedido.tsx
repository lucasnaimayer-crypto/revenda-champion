"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mudarStatus } from "@/app/(app)/pedidos/acoes";
import { Aviso, Botao } from "@/componentes/ui";
import { gerarPdfPedido, type CabecalhoPdf, type ItemPdf } from "./pdfPedido";

interface Props {
  pedidoId: string;
  numero: number;
  status: string;
  cabecalho: CabecalhoPdf;
  itens: ItemPdf[];
}

export default function AcoesPedido({ pedidoId, numero, status, cabecalho, itens }: Props) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [mudando, iniciar] = useTransition();

  async function baixarPdf() {
    setErro(null);
    setGerando(true);
    try {
      const blob = await gerarPdfPedido(cabecalho, itens);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pedido-${numero}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setErro(`Não foi possível gerar o PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGerando(false);
    }
  }

  function mudar(novo: string, confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return;
    setErro(null);
    iniciar(async () => {
      const r = await mudarStatus(pedidoId, novo);
      if (r.erro) setErro(r.erro);
      else router.refresh();
    });
  }

  const aberto = status === "enviado" || status === "confirmado";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Botao type="button" onClick={baixarPdf} disabled={gerando}>
          {gerando ? "Gerando PDF…" : "Baixar PDF com fotos"}
        </Botao>
        <a href={`/pedidos/${pedidoId}/planilha`} className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50">
          Baixar planilha (Excel)
        </a>
        {aberto && (
          <a href={`/pedidos/${pedidoId}/receber`} className="inline-flex items-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600">
            Receber peças
          </a>
        )}
        {status === "enviado" && (
          <Botao variante="secundario" type="button" disabled={mudando} onClick={() => mudar("confirmado")}>
            Representante confirmou
          </Botao>
        )}
        {status === "enviado" && (
          <Botao variante="secundario" type="button" disabled={mudando} onClick={() => mudar("rascunho")}>
            Voltar a editar
          </Botao>
        )}
        {aberto && (
          <Botao variante="perigo" type="button" disabled={mudando} onClick={() => mudar("cancelado", "Cancelar este pedido? As peças não entram no estoque.")}>
            Cancelar pedido
          </Botao>
        )}
      </div>
      {erro && <Aviso>{erro}</Aviso>}
    </div>
  );
}
