"use client";

// Leitura de fotos e prints de catálogo: o navegador reduz a imagem, o servidor pede à IA código,
// preço e posição de cada relógio, e a foto de cada peça é recortada aqui mesmo.
import type { PecaIa } from "@revenda/catalogo";

const LADO_MAXIMO = 1600;

export interface PecaDeImagem {
  pagina: number;
  posicao: number;
  codigo: string;
  custo: number;
  conferir: boolean;
  foto_blob: Blob | null;
  foto_url: string | null;
}

export const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp"];

function paraBlob(canvas: HTMLCanvasElement, qualidade = 0.85): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", qualidade));
}

async function paraBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

async function reduzir(arquivo: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(arquivo).catch(() => {
    throw new Error(`Não consegui abrir ${arquivo.name}. Use JPG, PNG ou WEBP.`);
  });
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

async function recortar(canvas: HTMLCanvasElement, caixa: NonNullable<PecaIa["caixa"]>): Promise<Blob | null> {
  // Uma pequena margem compensa a imprecisão da caixa devolvida pela IA.
  const margem = 0.02;
  const x = Math.max(0, caixa.x - margem) * canvas.width;
  const y = Math.max(0, caixa.y - margem) * canvas.height;
  const w = Math.min(canvas.width - x, (caixa.largura + 2 * margem) * canvas.width);
  const h = Math.min(canvas.height - y, (caixa.altura + 2 * margem) * canvas.height);
  if (w < 8 || h < 8) return null;
  const destino = document.createElement("canvas");
  destino.width = Math.round(w);
  destino.height = Math.round(h);
  destino.getContext("2d")!.drawImage(canvas, x, y, w, h, 0, 0, destino.width, destino.height);
  return paraBlob(destino);
}

/** Lê uma imagem como a página `pagina` do catálogo. */
export async function lerImagemNoNavegador(arquivo: File, pagina: number): Promise<{ pecas: PecaDeImagem[]; avisos: string[] }> {
  const canvas = await reduzir(arquivo);
  try {
    const blob = await paraBlob(canvas, 0.88);
    if (!blob) throw new Error(`Não consegui preparar ${arquivo.name}.`);
    const resposta = await fetch("/catalogos/ler-imagem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imagem: await paraBase64(blob), tipo: "image/jpeg" }),
    });
    const corpo = (await resposta.json().catch(() => null)) as { pecas?: PecaIa[]; avisos?: string[]; erro?: string } | null;
    if (!resposta.ok || !corpo?.pecas) throw new Error(corpo?.erro ?? "A leitura por IA falhou. Tente de novo.");
    const pecas: PecaDeImagem[] = [];
    for (const p of corpo.pecas) {
      const foto = p.caixa ? await recortar(canvas, p.caixa) : null;
      pecas.push({ pagina, posicao: p.posicao, codigo: p.codigo, custo: p.custo, conferir: p.conferir, foto_blob: foto, foto_url: foto ? URL.createObjectURL(foto) : null });
    }
    return { pecas, avisos: (corpo.avisos ?? []).map((a) => `Imagem ${pagina}: ${a}`) };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
