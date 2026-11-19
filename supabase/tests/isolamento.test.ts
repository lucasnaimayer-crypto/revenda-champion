// Prova que um revendedor não lê nem altera dados de outro, e que a equipe não vê custos.
import { beforeAll, describe, expect, it } from "vitest";
import { criarBanco, type Banco } from "./supabase-simulado";

const ANA = "00000000-0000-4000-8000-00000000000a";
const BRUNO = "00000000-0000-4000-8000-00000000000b";
const CARLA = "00000000-0000-4000-8000-00000000000c"; // equipe da Ana
const ESTRANHO = "00000000-0000-4000-8000-0000000000ff";

let b: Banco;
let revAna: string;
let revBruno: string;
let catAna: string;

async function criarRevendedor(usuario: string, nome: string): Promise<string> {
  const [r] = await b.como<{ id: string }>(usuario, "select public.criar_revendedor($1) as id", [nome]);
  return r.id;
}

beforeAll(async () => {
  b = await criarBanco();
  for (const u of [ANA, BRUNO, CARLA, ESTRANHO]) await b.criarUsuario(u);
  revAna = await criarRevendedor(ANA, "Relógios da Ana");
  revBruno = await criarRevendedor(BRUNO, "Bruno Revendas");
  // Equipe ainda não tem convite pelo app; entra direto pelo banco no teste.
  await b.admin(
    "insert into public.membro (usuario_id, organizacao_id, revendedor_id, papel) select $1, organizacao_id, id, 'equipe' from public.revendedor where id = $2",
    [CARLA, revAna]
  );
  [{ id: catAna }] = await b.como<{ id: string }>(
    ANA,
    "insert into public.catalogo (revendedor_id, nome, origem) values ($1, 'Coleção Verão', 'pdf') returning id",
    [revAna]
  );
  await b.como(
    ANA,
    "insert into public.catalogo_peca (catalogo_id, revendedor_id, pagina, posicao, codigo, custo) values ($1, $2, 1, 1, 'CH22911P', 12490)",
    [catAna, revAna]
  );
  await b.como(ANA, "insert into public.produto (revendedor_id, codigo, custo) values ($1, 'CH22911P', 12490)", [revAna]);
});

describe("criar_revendedor", () => {
  it("cria o revendedor com o usuário como dono e regra de preço sem valores herdados", async () => {
    const [regra] = await b.como<{ frete_bp: number; markup_bp: number }>(ANA, "select frete_bp, markup_bp from public.regra_preco where revendedor_id = $1", [revAna]);
    expect(regra).toEqual({ frete_bp: 0, markup_bp: 10000 });
    const [m] = await b.como<{ papel: string }>(ANA, "select papel from public.membro where revendedor_id = $1 and usuario_id = $2", [revAna, ANA]);
    expect(m.papel).toBe("dono");
  });

  it("não deixa o mesmo usuário criar dois revendedores", async () => {
    await expect(criarRevendedor(ANA, "Outro")).rejects.toThrow(/já tem um revendedor/);
  });

  it("não funciona sem login", async () => {
    await expect(b.como(null, "select public.criar_revendedor('x')")).rejects.toThrow();
  });
});

describe("isolamento entre revendedores", () => {
  it("cada um só vê o próprio revendedor", async () => {
    const daAna = await b.como<{ id: string }>(ANA, "select id from public.revendedor");
    const doBruno = await b.como<{ id: string }>(BRUNO, "select id from public.revendedor");
    expect(daAna.map((r) => r.id)).toEqual([revAna]);
    expect(doBruno.map((r) => r.id)).toEqual([revBruno]);
  });

  it("um usuário sem revendedor não vê nada", async () => {
    for (const tabela of ["revendedor", "catalogo", "catalogo_peca", "produto", "regra_preco", "membro", "pedido"]) {
      expect(await b.como(ESTRANHO, `select * from public.${tabela}`)).toEqual([]);
    }
  });

  it("Bruno não lê catálogos, peças, produtos nem regras da Ana", async () => {
    for (const tabela of ["catalogo", "catalogo_peca", "produto", "regra_preco", "auditoria"]) {
      expect(await b.como(BRUNO, `select * from public.${tabela} where revendedor_id = $1`, [revAna])).toEqual([]);
    }
  });

  it("Bruno não grava nada no revendedor da Ana", async () => {
    await expect(
      b.como(BRUNO, "insert into public.produto (revendedor_id, codigo) values ($1, 'X1')", [revAna])
    ).rejects.toThrow(/row-level security/);
    await expect(
      b.como(BRUNO, "insert into public.catalogo (revendedor_id, nome, origem) values ($1, 'x', 'pdf')", [revAna])
    ).rejects.toThrow(/row-level security/);
    const alterados = await b.como(BRUNO, "update public.produto set custo = 1 where revendedor_id = $1 returning id", [revAna]);
    expect(alterados).toEqual([]);
    const removidos = await b.como(BRUNO, "delete from public.catalogo where id = $1 returning id", [catAna]);
    expect(removidos).toEqual([]);
  });

  it("Bruno não pendura uma peça no catálogo da Ana usando o próprio revendedor_id", async () => {
    await expect(
      b.como(
        BRUNO,
        "insert into public.catalogo_peca (catalogo_id, revendedor_id, pagina, posicao, codigo, custo) values ($1, $2, 1, 2, 'Z', 1)",
        [catAna, revBruno]
      )
    ).rejects.toThrow(/outro revendedor/);
  });

  it("ninguém se adiciona como membro de outro revendedor", async () => {
    await expect(
      b.como(
        BRUNO,
        "insert into public.membro (usuario_id, organizacao_id, revendedor_id, papel) values ($1, (select id from public.organizacao where slug = 'champion'), $2, 'equipe')",
        [BRUNO, revAna]
      )
    ).rejects.toThrow(/row-level security/);
    expect(await b.como(BRUNO, "select * from public.produto where revendedor_id = $1", [revAna])).toEqual([]);
  });

  it("o dono não muda a organização nem o status do revendedor", async () => {
    await expect(b.como(ANA, "update public.revendedor set status = 'ativo' where id = $1", [revAna])).rejects.toThrow(/permission denied/);
    const [r] = await b.como<{ nome: string }>(ANA, "update public.revendedor set nome = 'Ana Relógios' where id = $1 returning nome", [revAna]);
    expect(r.nome).toBe("Ana Relógios");
  });
});

describe("papel da equipe", () => {
  it("vê produtos e estoque", async () => {
    const produtos = await b.como(CARLA, "select codigo from public.produto");
    expect(produtos).toEqual([{ codigo: "CH22911P" }]);
  });

  it("não vê regras de preço, catálogos nem pedidos", async () => {
    for (const tabela of ["regra_preco", "custo_tipo", "regra_comissao", "catalogo", "catalogo_peca", "pedido"]) {
      expect(await b.como(CARLA, `select * from public.${tabela}`)).toEqual([]);
    }
  });

  it("não cria produtos", async () => {
    await expect(b.como(CARLA, "insert into public.produto (revendedor_id, codigo) values ($1, 'Y')", [revAna])).rejects.toThrow(/row-level security/);
  });
});

describe("estoque", () => {
  it("movimento repetido com a mesma chave não duplica", async () => {
    const [{ id: produto }] = await b.como<{ id: string }>(ANA, "select id from public.produto where codigo = 'CH22911P'");
    const inserir = () =>
      b.como(
        ANA,
        "insert into public.estoque_movimento (revendedor_id, produto_id, tipo, quantidade, chave_idempotencia, criado_por) values ($1, $2, 'entrada', 3, 'pedido:1:item:1', $3) on conflict (revendedor_id, chave_idempotencia) do nothing",
        [revAna, produto, ANA]
      );
    await inserir();
    await inserir();
    const [saldo] = await b.como<{ saldo: number }>(CARLA, "select saldo from public.estoque_saldo where produto_id = $1", [produto]);
    expect(saldo.saldo).toBe(3);
    expect(await b.como(BRUNO, "select * from public.estoque_saldo")).toEqual([]);
  });

  it("movimentos não podem ser alterados nem apagados", async () => {
    expect(await b.como(ANA, "update public.estoque_movimento set quantidade = 99 returning id")).toEqual([]);
    expect(await b.como(ANA, "delete from public.estoque_movimento returning id")).toEqual([]);
  });
});

describe("arquivos", () => {
  it("só o dono envia e só membros leem arquivos na pasta do revendedor", async () => {
    await b.como(ANA, "insert into storage.objects (bucket_id, name) values ('catalogos', $1)", [`${revAna}/${catAna}/pagina-1.png`]);
    await expect(
      b.como(BRUNO, "insert into storage.objects (bucket_id, name) values ('catalogos', $1)", [`${revAna}/x/y.png`])
    ).rejects.toThrow(/row-level security/);
    expect(await b.como(BRUNO, "select name from storage.objects")).toEqual([]);
    expect((await b.como(CARLA, "select name from storage.objects")).length).toBe(1);
  });
});
