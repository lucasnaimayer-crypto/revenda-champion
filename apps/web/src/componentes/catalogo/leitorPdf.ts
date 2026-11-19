"use client";

// Lê um catálogo PDF no navegador: extrai código, preço e posição da foto de cada peça
// (pacote @revenda/catalogo) e recorta a foto renderizando a página num canvas.
import { consolidar, extrairElementos, montarPagina, type OpsPdf, type PaginaPdf, type PecaLida } from "@revenda/catalogo";

export interface PecaComFoto extends PecaLida {
  foto_blob: Blob | null;
  foto_url: string | null;
}

export interface ProgressoLeitura {
  pagina: number;
  total: number;
}

const ESCALA = 2;

async function carregarPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs;
}

function recortar(canvas: HTMLCanvasElement, alturaPagina: number, peca: PecaLida): Promise<Blob | null> {
  if (!peca.foto) return Promise.resolve(null);
  const { x, y, largura, altura } = peca.foto;
  const sx = Math.max(0, Math.floor(x * ESCALA));
  const sy = Math.max(0, Math.floor((alturaPagina - y - altura) * ESCALA));
  const sw = Math.min(canvas.width - sx, Math.ceil(largura * ESCALA));
  const sh = Math.min(canvas.height - sy, Math.ceil(altura * ESCALA));
  if (sw <= 0 || sh <= 0) return Promise.resolve(null);
  const destino = document.createElement("canvas");
  destino.width = sw;
  destino.height = sh;
  destino.getContext("2d")!.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return new Promise((resolve) => destino.toBlob((b) => resolve(b), "image/jpeg", 0.85));
}

export async function lerPdfNoNavegador(arquivo: File, aoProgredir?: (p: ProgressoLeitura) => void) {
  const pdfjs = await carregarPdfjs();
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) });
  const doc = await tarefa.promise;
  const paginas = [];
  const pecas: PecaComFoto[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      aoProgredir?.({ pagina: n, total: doc.numPages });
      const pagina = await doc.getPage(n);
      const lida = montarPagina(await extrairElementos(pagina as unknown as PaginaPdf, n, pdfjs.OPS as unknown as OpsPdf));
      paginas.push(lida);
      if (lida.pecas.length > 0) {
        const vista = pagina.getViewport({ scale: ESCALA });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(vista.width);
        canvas.height = Math.ceil(vista.height);
        await pagina.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vista }).promise;
        for (const peca of lida.pecas) {
          const blob = await recortar(canvas, lida.altura, peca);
          pecas.push({ ...peca, foto_blob: blob, foto_url: blob ? URL.createObjectURL(blob) : null });
        }
        canvas.width = 0;
        canvas.height = 0;
      }
      pagina.cleanup();
    }
  } finally {
    await tarefa.destroy();
  }
  const resumo = consolidar(paginas);
  return { pecas, totalPaginas: doc.numPages, paginasSemTexto: resumo.paginasSemTexto, codigosRepetidos: resumo.codigosRepetidos, avisos: paginas.flatMap((p) => p.avisos.map((a) => `Página ${p.numero}: ${a}`)) };
}
