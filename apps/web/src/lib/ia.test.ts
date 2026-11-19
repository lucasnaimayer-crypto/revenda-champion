// Confere o pedido que vai para a API da Claude e o tratamento da resposta, com um servidor falso.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ErroLeitura, iaDisponivel, lerImagemCatalogo } from "./ia";

let servidor: Server;
let recebido: { url?: string; cabecalhos: Record<string, string | string[] | undefined>; corpo: Record<string, unknown> } | null = null;
let resposta: { status: number; corpo: unknown };

const mensagem = (texto: string, stop_reason = "end_turn") => ({
  id: "msg_teste",
  type: "message",
  role: "assistant",
  model: "modelo-teste",
  content: [{ type: "text", text: texto }],
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
});

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let dados = "";
    req.on("data", (c) => (dados += c));
    req.on("end", () => {
      recebido = { url: req.url, cabecalhos: req.headers, corpo: JSON.parse(dados) };
      res.writeHead(resposta.status, { "content-type": "application/json" });
      res.end(JSON.stringify(resposta.corpo));
    });
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "chave-de-teste";
  process.env.ANTHROPIC_MODEL = "modelo-teste";
});

afterAll(() => servidor.close());
beforeEach(() => (recebido = null));

describe("lerImagemCatalogo", () => {
  it("manda a imagem com saída estruturada e substituto em caso de recusa, e normaliza as peças", async () => {
    resposta = {
      status: 200,
      corpo: mensagem(JSON.stringify({ pecas: [{ codigo: "cn29018x", preco: "R$ 189,90", x: 100, y: 100, largura: 300, altura: 300, legivel: true }] })),
    };
    const r = await lerImagemCatalogo("aGVsbG8=", "image/jpeg");
    expect(r.pecas).toEqual([{ posicao: 1, codigo: "CN29018X", custo: 18990, caixa: { x: 0.1, y: 0.1, largura: 0.3, altura: 0.3 }, conferir: false }]);

    expect(recebido?.url).toMatch(/^\/v1\/messages/);
    expect(String(recebido?.cabecalhos["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    const corpo = recebido!.corpo as {
      model: string;
      fallbacks: string;
      output_config: { format: { type: string; schema: { properties: Record<string, unknown> } } };
      messages: { content: { type: string; source?: { media_type: string; data: string } }[] }[];
    };
    expect(corpo.model).toBe("modelo-teste");
    expect(corpo.fallbacks).toBe("default");
    expect(corpo.output_config.format.type).toBe("json_schema");
    expect(Object.keys(corpo.output_config.format.schema.properties)).toEqual(["pecas"]);
    expect(corpo.messages[0].content[0]).toMatchObject({ type: "image", source: { media_type: "image/jpeg", data: "aGVsbG8=" } });
  });

  it("recusa vira mensagem amigável", async () => {
    resposta = { status: 200, corpo: mensagem("", "refusal") };
    await expect(lerImagemCatalogo("aGVsbG8=", "image/png")).rejects.toThrow(ErroLeitura);
  });

  it("erro da API vira mensagem amigável", async () => {
    resposta = { status: 401, corpo: { type: "error", error: { type: "authentication_error", message: "x" } } };
    await expect(lerImagemCatalogo("aGVsbG8=", "image/png")).rejects.toThrow(/chave da IA/);
  });

  it("fica desligada sem modelo configurado", () => {
    const modelo = process.env.ANTHROPIC_MODEL;
    delete process.env.ANTHROPIC_MODEL;
    expect(iaDisponivel()).toBe(false);
    process.env.ANTHROPIC_MODEL = modelo;
    expect(iaDisponivel()).toBe(true);
  });
});

describe("respostas fora do esperado", () => {
  it("JSON inválido ou campos faltando viram mensagem amigável", async () => {
    resposta = { status: 200, corpo: mensagem('{"pecas": [{"codigo": "X"}]}') };
    await expect(lerImagemCatalogo("aGVsbG8=", "image/png")).rejects.toThrow(/formato inesperado/);
    resposta = { status: 200, corpo: mensagem("{\"pecas\": [") };
    await expect(lerImagemCatalogo("aGVsbG8=", "image/png")).rejects.toThrow(/formato inesperado/);
  });

  it("resposta cortada por tamanho pede para dividir a página", async () => {
    resposta = { status: 200, corpo: mensagem('{"pecas": [', "max_tokens") };
    await expect(lerImagemCatalogo("aGVsbG8=", "image/png")).rejects.toThrow(/em partes/);
  });
});
