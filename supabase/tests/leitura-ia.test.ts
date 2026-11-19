// Leitura por IA: só o dono registra, e há um limite por revendedor a cada 24 horas.
import { beforeAll, describe, expect, it } from "vitest";
import { criarBanco, type Banco } from "./supabase-simulado";

const ANA = "00000000-0000-4000-8000-0000000000a1";
const BRUNO = "00000000-0000-4000-8000-0000000000b1";

let b: Banco;
let revAna: string;
let revBruno: string;

const ler = (usuario: string, revendedor: string, limite = 2) =>
  b.como<{ restam: number }>(usuario, "select public.registrar_leitura_ia($1, $2) as restam", [revendedor, limite]).then((r) => r[0].restam);

beforeAll(async () => {
  b = await criarBanco();
  await b.criarUsuario(ANA, "ana@ia.dev");
  await b.criarUsuario(BRUNO, "bruno@ia.dev");
  [{ id: revAna }] = await b.como<{ id: string }>(ANA, "select public.criar_revendedor('Ana') as id");
  [{ id: revBruno }] = await b.como<{ id: string }>(BRUNO, "select public.criar_revendedor('Bruno') as id");
});

describe("registrar_leitura_ia", () => {
  it("conta as leituras e bloqueia ao passar do limite", async () => {
    expect(await ler(ANA, revAna)).toBe(1);
    expect(await ler(ANA, revAna)).toBe(0);
    await expect(ler(ANA, revAna)).rejects.toThrow(/limite de 2 leituras/);
    // O limite é de cada revendedor.
    expect(await ler(BRUNO, revBruno)).toBe(1);
  });

  it("leituras de mais de 24 horas não contam", async () => {
    await b.admin("update public.auditoria set criado_em = now() - interval '25 hours' where revendedor_id = $1 and acao = 'leitura_ia'", [revAna]);
    expect(await ler(ANA, revAna)).toBe(1);
  });

  it("ninguém registra leitura em nome de outro revendedor", async () => {
    await expect(ler(BRUNO, revAna)).rejects.toThrow(/só o dono/);
  });
});
