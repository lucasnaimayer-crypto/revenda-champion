// Leitura de PDF no Node (testes e scripts). No navegador use extrairElementos com o pdf.js normal.
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { consolidar, montarPagina, type ResultadoCatalogo } from "./montar";
import { extrairElementos, type OpsPdf, type PaginaPdf } from "./pdf";

export async function lerCatalogoPdf(dados: Uint8Array): Promise<ResultadoCatalogo> {
  const tarefa = getDocument({ data: dados, verbosity: 0 });
  const doc = await tarefa.promise;
  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const elementos = await extrairElementos(pagina as unknown as PaginaPdf, n, OPS as unknown as OpsPdf);
    paginas.push(montarPagina(elementos));
    pagina.cleanup();
  }
  await tarefa.destroy();
  return consolidar(paginas);
}
