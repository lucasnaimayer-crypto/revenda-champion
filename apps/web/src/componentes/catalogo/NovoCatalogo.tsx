"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatarReais, lerReais } from "@revenda/regras";
import { Aviso, Botao, Cartao, classeCampo } from "@/componentes/ui";
import { supabaseNavegador } from "@/lib/supabase/navegador";
import { lerImagemNoNavegador, TIPOS_IMAGEM } from "./leitorImagem";
import { lerPdfNoNavegador } from "./leitorPdf";

type Etapa = "escolher" | "lendo" | "revisar" | "salvando";

interface PecaEditavel {
  pagina: number;
  posicao: number;
  codigo: string;
  custo: number;
  foto_blob: Blob | null;
  foto_url: string | null;
  /** Leitura incerta da IA: destacar para o revendedor conferir. */
  conferir: boolean;
  codigoTexto: string;
  custoTexto: string;
  incluir: boolean;
}

const LIMITE_MB = 80;
const LIMITE_IMAGENS = 20;

const ehPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === "application/pdf";
const ehImagem = (f: File) => TIPOS_IMAGEM.includes(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);
const editavel = (p: Omit<PecaEditavel, "codigoTexto" | "custoTexto" | "incluir">): PecaEditavel => ({
  ...p,
  codigoTexto: p.codigo,
  custoTexto: p.custo > 0 ? (p.custo / 100).toFixed(2).replace(".", ",") : "",
  incluir: true,
});

async function emParalelo<T>(itens: T[], limite: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (i < itens.length) await fn(itens[i++]);
  });
  await Promise.all(trabalhadores);
}

export default function NovoCatalogo({ revendedorId, iaDisponivel }: { revendedorId: string; iaDisponivel: boolean }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<Etapa>("escolher");
  const [nome, setNome] = useState("");
  const [progresso, setProgresso] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [pecas, setPecas] = useState<PecaEditavel[]>([]);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [sobre, setSobre] = useState(false);
  const [origem, setOrigem] = useState<"pdf" | "imagem">("pdf");

  useEffect(() => () => pecas.forEach((p) => p.foto_url && URL.revokeObjectURL(p.foto_url)), [pecas]);

  const lerPdf = useCallback(async (arquivo: File) => {
    if (arquivo.size > LIMITE_MB * 1024 * 1024) {
      setErro(`O arquivo passa de ${LIMITE_MB} MB.`);
      return;
    }
    setNome((n) => n || arquivo.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim());
    setEtapa("lendo");
    try {
      const r = await lerPdfNoNavegador(arquivo, ({ pagina, total }) => setProgresso(`Lendo página ${pagina} de ${total}…`));
      const lista = [...r.avisos];
      if (r.paginasSemTexto.length) lista.push(`Páginas sem código e preço em texto: ${r.paginasSemTexto.join(", ")}.`);
      if (r.codigosRepetidos.length) lista.push(`Códigos repetidos no catálogo: ${r.codigosRepetidos.join(", ")}.`);
      if (r.pecas.length === 0) {
        setErro(
          iaDisponivel
            ? "Não encontrei peças com código e preço neste PDF. Se for um catálogo escaneado, envie prints ou fotos das páginas."
            : "Não encontrei peças com código e preço neste PDF. Catálogos escaneados precisam da leitura por IA, que não está ligada neste sistema."
        );
        setEtapa("escolher");
        return;
      }
      setAvisos(lista);
      setTotalPaginas(r.totalPaginas);
      setOrigem("pdf");
      setPecas(r.pecas.map((p) => editavel({ pagina: p.pagina, posicao: p.posicao, codigo: p.codigo, custo: p.custo, foto_blob: p.foto_blob, foto_url: p.foto_url, conferir: false })));
      setEtapa("revisar");
    } catch (e) {
      setErro(`Não consegui ler o PDF: ${e instanceof Error ? e.message : String(e)}`);
      setEtapa("escolher");
    }
  }, [iaDisponivel]);

  const lerImagens = useCallback(async (arquivos: File[]) => {
    if (arquivos.length > LIMITE_IMAGENS) {
      setErro(`Envie no máximo ${LIMITE_IMAGENS} imagens por vez.`);
      return;
    }
    setEtapa("lendo");
    const lidas: PecaEditavel[] = [];
    const lista: string[] = [];
    for (const [i, arquivo] of arquivos.entries()) {
      setProgresso(`Lendo imagem ${i + 1} de ${arquivos.length} com IA… pode levar até um minuto por imagem.`);
      try {
        const r = await lerImagemNoNavegador(arquivo, i + 1);
        lidas.push(...r.pecas.map(editavel));
        lista.push(...r.avisos);
        if (r.pecas.length === 0) lista.push(`Imagem ${i + 1} (${arquivo.name}): nenhuma peça encontrada.`);
      } catch (e) {
        lista.push(`Imagem ${i + 1} (${arquivo.name}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (lidas.length === 0) {
      setErro(lista.join(" ") || "Não encontrei peças nas imagens.");
      setEtapa("escolher");
      return;
    }
    const repetidos = [...new Set(lidas.map((p) => p.codigo).filter((c, i, l) => c && l.indexOf(c) !== i))];
    if (repetidos.length) lista.push(`Códigos repetidos entre imagens: ${repetidos.join(", ")}.`);
    const incertas = lidas.filter((p) => p.conferir).length;
    if (incertas) lista.unshift(`${incertas} peça(s) com leitura incerta estão destacadas em amarelo: confira código e preço.`);
    setNome((n) => n || `Catálogo ${new Date().toLocaleDateString("pt-BR")}`);
    setAvisos(lista);
    setTotalPaginas(arquivos.length);
    setOrigem("imagem");
    setPecas(lidas);
    setEtapa("revisar");
  }, []);

  const ler = useCallback(
    (arquivos: File[]) => {
      setErro(null);
      if (arquivos.length === 0) return;
      if (arquivos.length === 1 && ehPdf(arquivos[0])) return void lerPdf(arquivos[0]);
      if (arquivos.every(ehImagem)) {
        if (!iaDisponivel) return setErro("Este sistema lê catálogos em PDF. A leitura de fotos e prints por IA não está ligada.");
        return void lerImagens(arquivos);
      }
      setErro(iaDisponivel ? "Envie um PDF do catálogo ou fotos e prints das páginas (JPG, PNG ou WEBP)." : "Envie o catálogo em PDF.");
    },
    [iaDisponivel, lerPdf, lerImagens]
  );

  const mudar = (i: number, parte: Partial<PecaEditavel>) => setPecas((l) => l.map((p, j) => (j === i ? { ...p, ...parte } : p)));

  async function salvar() {
    setErro(null);
    const escolhidas = pecas.filter((p) => p.incluir);
    const invalida = escolhidas.find((p) => !p.codigoTexto.trim() || (lerReais(p.custoTexto) ?? 0) <= 0);
    if (!nome.trim()) return setErro("Dê um nome ao catálogo.");
    if (escolhidas.length === 0) return setErro("Nenhuma peça selecionada.");
    if (invalida) return setErro(`Confira código e preço da peça ${origem === "pdf" ? "da página" : "da imagem"} ${invalida.pagina}, posição ${invalida.posicao}.`);

    setEtapa("salvando");
    const supabase = supabaseNavegador();
    const { data: catalogo, error } = await supabase
      .from("catalogo")
      .insert({ revendedor_id: revendedorId, nome: nome.trim().slice(0, 120), origem, total_paginas: totalPaginas })
      .select("id")
      .single();
    if (error || !catalogo) {
      setErro(error?.message ?? "Não foi possível criar o catálogo.");
      setEtapa("revisar");
      return;
    }
    try {
      let enviadas = 0;
      const caminhos = new Map<PecaEditavel, string>();
      await emParalelo(escolhidas, 6, async (p) => {
        if (p.foto_blob) {
          const caminho = `${revendedorId}/${catalogo.id}/p${p.pagina}-${p.posicao}.jpg`;
          const r = await supabase.storage.from("catalogos").upload(caminho, p.foto_blob, { contentType: "image/jpeg", upsert: true });
          if (r.error) throw new Error(`Foto de ${p.codigoTexto}: ${r.error.message}`);
          caminhos.set(p, caminho);
        }
        enviadas++;
        setProgresso(`Enviando fotos: ${enviadas} de ${escolhidas.length}`);
      });
      setProgresso("Gravando peças…");
      const linhas = escolhidas.map((p) => ({
        catalogo_id: catalogo.id,
        revendedor_id: revendedorId,
        pagina: p.pagina,
        posicao: p.posicao,
        codigo: p.codigoTexto.trim().toUpperCase().slice(0, 40),
        custo: lerReais(p.custoTexto) ?? 0,
        imagem_path: caminhos.get(p) ?? null,
        origem_leitura: p.codigoTexto.trim().toUpperCase() === p.codigo && lerReais(p.custoTexto) === p.custo ? (origem === "pdf" ? "pdf" : "ia") : "manual",
        revisada: true,
      }));
      for (let i = 0; i < linhas.length; i += 200) {
        const r = await supabase.from("catalogo_peca").insert(linhas.slice(i, i + 200));
        if (r.error) throw new Error(r.error.message);
      }
      const fim = await supabase.from("catalogo").update({ status: "pronto", total_pecas: linhas.length }).eq("id", catalogo.id);
      if (fim.error) throw new Error(fim.error.message);
      router.push(`/catalogos?salvo=${catalogo.id}`);
      router.refresh();
    } catch (e) {
      await supabase.from("catalogo").update({ status: "erro" }).eq("id", catalogo.id);
      setErro(`Falha ao salvar: ${e instanceof Error ? e.message : String(e)}`);
      setEtapa("revisar");
    }
  }

  if (etapa === "escolher" || etapa === "lendo") {
    return (
      <Cartao>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setSobre(true);
          }}
          onDragLeave={() => setSobre(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSobre(false);
            ler(Array.from(e.dataTransfer.files ?? []));
          }}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition ${
            sobre ? "border-marca bg-marca/5" : "border-zinc-300"
          }`}
        >
          {etapa === "lendo" ? (
            <p className="text-sm text-zinc-600">{progresso || "Abrindo o PDF…"}</p>
          ) : (
            <>
              <p className="font-medium">{iaDisponivel ? "Arraste aqui o PDF do catálogo, ou fotos e prints das páginas" : "Arraste aqui o PDF do catálogo"}</p>
              <p className="mt-1 text-sm text-zinc-500">
                O sistema separa cada relógio com foto, código e preço. Nada é salvo antes de você revisar.
                {iaDisponivel && " Fotos e prints são lidos por IA: confira os valores destacados."}
              </p>
              <Botao type="button" className="mt-6" onClick={() => entrada.current?.click()}>
                Escolher arquivo
              </Botao>
              <input
                ref={entrada}
                type="file"
                accept={iaDisponivel ? "application/pdf,.pdf,image/jpeg,image/png,image/webp" : "application/pdf,.pdf"}
                multiple={iaDisponivel}
                className="hidden"
                onChange={(e) => {
                  ler(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
        {erro && (
          <div className="mt-4">
            <Aviso>{erro}</Aviso>
          </div>
        )}
      </Cartao>
    );
  }

  const selecionadas = pecas.filter((p) => p.incluir).length;
  return (
    <div className="space-y-4">
      <Cartao className="flex flex-wrap items-end gap-4">
        <label className="block min-w-64 flex-1 space-y-1">
          <span className="text-sm font-medium">Nome do catálogo</span>
          <input className={classeCampo} value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} />
        </label>
        <p className="text-sm text-zinc-500">
          {pecas.length} peças em {totalPaginas} {origem === "pdf" ? "páginas" : totalPaginas === 1 ? "imagem" : "imagens"} · {selecionadas} selecionadas
        </p>
        <Botao type="button" onClick={salvar} disabled={etapa === "salvando"}>
          {etapa === "salvando" ? progresso || "Salvando…" : "Salvar catálogo"}
        </Botao>
      </Cartao>
      {erro && <Aviso>{erro}</Aviso>}
      {avisos.length > 0 && <Aviso tipo="info">{avisos.slice(0, 5).join(" ")}</Aviso>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {pecas.map((p, i) => (
          <div key={`${p.pagina}-${p.posicao}`} className={`rounded-xl border bg-white p-2 ${!p.incluir ? "border-zinc-100 opacity-40" : p.conferir ? "border-amber-400 ring-1 ring-amber-300" : "border-zinc-200"}`}>
            <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-zinc-100">
              {p.foto_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:), antes do envio
                <img src={p.foto_url} alt={p.codigoTexto} className="h-full w-full object-contain" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">sem foto</span>
              )}
              <label className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[11px]">
                <input type="checkbox" checked={p.incluir} onChange={(e) => mudar(i, { incluir: e.target.checked })} />
                incluir
              </label>
              <span className="absolute bottom-1.5 right-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[11px] text-zinc-500">{origem === "pdf" ? "p." : "img."} {p.pagina}</span>
            </div>
            <input
              aria-label="Código"
              className="mt-2 w-full rounded border border-transparent px-1 font-mono text-sm hover:border-zinc-200 focus:border-zinc-400 focus:outline-none"
              value={p.codigoTexto}
              onChange={(e) => mudar(i, { codigoTexto: e.target.value })}
            />
            <div className="flex items-center px-1 text-sm text-zinc-500">
              R$
              <input
                aria-label="Preço"
                inputMode="decimal"
                className="ml-1 w-full rounded border border-transparent px-1 hover:border-zinc-200 focus:border-zinc-400 focus:outline-none"
                value={p.custoTexto}
                onChange={(e) => mudar(i, { custoTexto: e.target.value })}
              />
            </div>
            {p.custo > 0 && lerReais(p.custoTexto) !== p.custo && (lerReais(p.custoTexto) ?? 0) > 0 && (
              <p className="px-1 text-[11px] text-amber-700">era {formatarReais(p.custo)}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
