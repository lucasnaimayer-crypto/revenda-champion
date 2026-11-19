// Convite da equipe: só o dono convida; o convite vale para o e-mail certo, uma vez, por 7 dias.
import { beforeAll, describe, expect, it } from "vitest";
import { criarBanco, type Banco } from "./supabase-simulado";

const ANA = "00000000-0000-4000-8000-00000000000a";
const BRUNO = "00000000-0000-4000-8000-00000000000b";
const CARLA = "00000000-0000-4000-8000-00000000000c";
const DANI = "00000000-0000-4000-8000-00000000000d";

let b: Banco;
let revAna: string;

const convidar = (email: string, usuario = ANA, revendedor = () => revAna) =>
  b.como<{ token: string; id: string }>(usuario, "insert into public.convite (revendedor_id, email, criado_por) values ($1, $2, $3) returning token, id", [revendedor(), email, usuario]).then((r) => r[0]);

beforeAll(async () => {
  b = await criarBanco();
  await b.criarUsuario(ANA, "ana@teste.dev");
  await b.criarUsuario(BRUNO, "bruno@teste.dev");
  await b.criarUsuario(CARLA, "Carla@Teste.dev");
  await b.criarUsuario(DANI, "dani@teste.dev");
  [{ id: revAna }] = await b.como<{ id: string }>(ANA, "select public.criar_revendedor('Ana Relógios') as id");
  await b.como(BRUNO, "select public.criar_revendedor('Bruno')");
});

describe("convite", () => {
  it("o dono convida e a pessoa certa aceita, virando equipe", async () => {
    const { token } = await convidar("carla@teste.dev");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await b.como(CARLA, "select revendedor, email, situacao from public.ver_convite($1)", [token])).toEqual([
      { revendedor: "Ana Relógios", email: "carla@teste.dev", situacao: "valido" },
    ]);
    await b.como(CARLA, "select public.aceitar_convite($1)", [token]);
    expect(await b.como(ANA, "select papel, email from public.membro where usuario_id = $1", [CARLA])).toEqual([{ papel: "equipe", email: "carla@teste.dev" }]);
    expect(await b.como(CARLA, "select nome from public.revendedor")).toEqual([{ nome: "Ana Relógios" }]);
    // Aceitar de novo não duplica.
    await b.como(CARLA, "select public.aceitar_convite($1)", [token]);
    expect(await b.como(CARLA, "select situacao from public.ver_convite($1)", [token])).toEqual([{ situacao: "aceito" }]);
  });

  it("recusa outro e-mail, quem já tem revenda e convite usado", async () => {
    const { token } = await convidar("dani@teste.dev");
    await expect(b.como(BRUNO, "select public.aceitar_convite($1)", [token])).rejects.toThrow(/é para dani@teste.dev/);
    const paraBruno = await convidar("bruno@teste.dev");
    await expect(b.como(BRUNO, "select public.aceitar_convite($1)", [paraBruno.token])).rejects.toThrow(/outra revenda/);
    await b.como(DANI, "select public.aceitar_convite($1)", [token]);
    const outro = await convidar("dani@teste.dev");
    await b.admin("update public.convite set aceito_em = now() where id = $1", [outro.id]);
    await expect(b.como(BRUNO, "select public.aceitar_convite($1)", [outro.token])).rejects.toThrow(/já foi usado/);
  });

  it("convite expirado ou cancelado não vale", async () => {
    const expirado = await convidar("x@teste.dev");
    await b.admin("update public.convite set expira_em = now() - interval '1 day' where id = $1", [expirado.id]);
    await b.criarUsuario("00000000-0000-4000-8000-0000000000ee", "x@teste.dev");
    await expect(b.como("00000000-0000-4000-8000-0000000000ee", "select public.aceitar_convite($1)", [expirado.token])).rejects.toThrow(/expirou/);
    const cancelado = await convidar("x@teste.dev");
    await b.como(ANA, "update public.convite set cancelado_em = now() where id = $1", [cancelado.id]);
    await expect(b.como("00000000-0000-4000-8000-0000000000ee", "select public.aceitar_convite($1)", [cancelado.token])).rejects.toThrow(/cancelado/);
  });

  it("só o dono cria e vê convites; ninguém muda o e-mail de um convite", async () => {
    await expect(convidar("y@teste.dev", CARLA)).rejects.toThrow(/row-level security/);
    await expect(convidar("y@teste.dev", BRUNO)).rejects.toThrow(/row-level security/);
    expect(await b.como(BRUNO, "select * from public.convite")).toEqual([]);
    expect(await b.como(CARLA, "select * from public.convite")).toEqual([]);
    await expect(b.como(ANA, "update public.convite set email = 'z@teste.dev'")).rejects.toThrow(/permission denied/);
  });

  it("o dono remove alguém da equipe", async () => {
    const r = await b.como(ANA, "delete from public.membro where usuario_id = $1 returning id", [DANI]);
    expect(r).toHaveLength(1);
    expect(await b.como(DANI, "select * from public.revendedor")).toEqual([]);
  });
});
