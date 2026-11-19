// Uso: pnpm --filter @revenda/catalogo ler caminho/do/catalogo.pdf [outro.pdf ...]
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { lerCatalogoPdf } from "../src/node";

for (const arquivo of process.argv.slice(2)) {
  const r = await lerCatalogoPdf(new Uint8Array(readFileSync(arquivo)));
  const semFoto = r.pecas.filter((p) => !p.foto).length;
  const avisos = r.paginas.flatMap((p) => p.avisos.map((a) => `p${p.numero}: ${a}`));
  console.log(`${basename(arquivo)}: ${r.paginas.length} páginas, ${r.pecas.length} peças, ${semFoto} sem foto, ${r.codigosRepetidos.length} códigos repetidos, páginas sem texto: ${r.paginasSemTexto.join(",") || "nenhuma"}`);
  for (const a of avisos.slice(0, 10)) console.log(`  ${a}`);
  if (process.env.DETALHE) for (const p of r.pecas) console.log(`  p${p.pagina}#${p.posicao} ${p.codigo} ${(p.custo / 100).toFixed(2)} foto=${p.foto ? `${p.foto.x.toFixed(0)},${p.foto.y.toFixed(0)} ${p.foto.largura.toFixed(0)}x${p.foto.altura.toFixed(0)}` : "-"}`);
}
