"use client";

// PDF do pedido para o representante: grade com foto, código, quantidade e preço do catálogo.
// Não leva custos nem lucro do revendedor.
import { formatarReais } from "@revenda/regras";

export interface ItemPdf {
  codigo: string;
  quantidade: number;
  custo: number;
  url: string | null;
}

export interface CabecalhoPdf {
  titulo: string;
  revendedor: string;
  contato?: string | null;
  data: string;
}

async function paraDataUrl(url: string): Promise<string | null> {
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) return null;
    const blob = await resposta.blob();
    return await new Promise((resolve) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(typeof leitor.result === "string" ? leitor.result : null);
      leitor.onerror = () => resolve(null);
      leitor.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function gerarPdfPedido(cabecalho: CabecalhoPdf, itens: ItemPdf[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const largura = 210;
  const margem = 12;
  const colunas = 4;
  const espaco = 4;
  const larguraCelula = (largura - margem * 2 - espaco * (colunas - 1)) / colunas;
  const alturaFoto = larguraCelula * (4 / 3);
  const alturaCelula = alturaFoto + 14;
  const ordenados = [...itens].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const imagens = await Promise.all(ordenados.map((i) => (i.url ? paraDataUrl(i.url) : Promise.resolve(null))));
  const pecas = ordenados.reduce((s, i) => s + i.quantidade, 0);
  const total = ordenados.reduce((s, i) => s + i.custo * i.quantidade, 0);

  const topo = () => {
    doc.setFont("helvetica", "bold").setFontSize(14).text(cabecalho.titulo, margem, 16);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
    doc.text([cabecalho.revendedor, cabecalho.contato ?? "", cabecalho.data].filter(Boolean).join("  ·  "), margem, 22);
    doc.text(`${pecas} peças  ·  ${ordenados.length} modelos  ·  Total ${formatarReais(total)}`, margem, 27);
    doc.setTextColor(0);
    return 33;
  };

  let y = topo();
  ordenados.forEach((item, i) => {
    const coluna = i % colunas;
    if (coluna === 0 && i > 0) y += alturaCelula + espaco;
    if (y + alturaCelula > 297 - margem) {
      doc.addPage();
      y = topo();
    }
    const x = margem + coluna * (larguraCelula + espaco);
    doc.setDrawColor(225).roundedRect(x, y, larguraCelula, alturaCelula, 2, 2);
    const img = imagens[i];
    if (img) {
      try {
        doc.addImage(img, "JPEG", x + 1.5, y + 1.5, larguraCelula - 3, alturaFoto - 3, undefined, "FAST");
      } catch {
        // Foto inválida: segue sem ela.
      }
    }
    doc.setFont("courier", "bold").setFontSize(10).text(item.codigo, x + 2, y + alturaFoto + 4.5);
    doc.setFont("helvetica", "normal").setFontSize(9);
    doc.text(`${item.quantidade} x ${formatarReais(item.custo)}`, x + 2, y + alturaFoto + 9.5);
    doc.setFont("helvetica", "bold").text(formatarReais(item.custo * item.quantidade), x + larguraCelula - 2, y + alturaFoto + 9.5, { align: "right" });
  });

  return doc.output("blob");
}
