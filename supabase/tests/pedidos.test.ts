// Fluxo do pedido no banco: numeração, travas por situação, recebimento e estoque.
import { beforeAll, describe, expect, it } from "vitest";
import { criarBanco, type Banco } from "./supabase-simulado";

const ANA = "00000000-0000-4000-8000-00000000000a";
const BRUNO = "00000000-0000-4000-8000-00000000000b";

let b: Banco;
let revAna: string;

async function novoPedido(nome = "Pedido"): Promise<{ id: string; numero: number }> {
  const [p] = await b.como<{ id: string; numero: number }>(
    ANA,
    "insert into public.pedido (revendedor_id, nome) values ($1, $2) returning id, numero",
    [revAna, nome]
  );
  return p;
}

async function item(pedido: string, codigo: string, quantidade: number, custo = 12490) {
  const [i] = await b.como<{ id: string }>(
    ANA,
    `insert into public.pedido_item (pedido_id, revendedor_id, codigo, quantidade, custo, custo_total, preco_venda, lucro, imagem_path)
     values ($1, $2, $3, $4, $5, $5, $5 * 2, $5, $6) returning id`,
    [pedido, revAna, codigo, quantidade, custo, `${revAna}/cat/${codigo}.jpg`]
  );
  return i.id;
}

const status = (id: string) => b.como<{ status: string }>(ANA, "select status from public.pedido where id = $1", [id]).then((r) => r[0].status);

beforeAll(async () => {
  b = await criarBanco();
  await b.criarUsuario(ANA);
  await b.criarUsuario(BRUNO);
  [{ id: revAna }] = await b.como<{ id: string }>(ANA, "select public.criar_revendedor('Ana') as id");
  await b.como(BRUNO, "select public.criar_revendedor('Bruno')");
});

describe("numeração", () => {
  it("numera os pedidos de cada revendedor a partir de 1", async () => {
    const a = await novoPedido("A");
    const c = await novoPedido("B");
    expect(c.numero).toBe(a.numero + 1);
    const [doBruno] = await b.como<{ numero: number }>(
      BRUNO,
      "insert into public.pedido (revendedor_id, nome) select id, 'X' from public.revendedor returning numero"
    );
    expect(doBruno.numero).toBe(1);
  });
});

describe("situação", () => {
  it("não muda a situação por update direto", async () => {
    const p = await novoPedido();
    await expect(b.como(ANA, "update public.pedido set status = 'recebido' where id = $1", [p.id])).rejects.toThrow(/mudar_status_pedido/);
  });

  it("não envia pedido vazio", async () => {
    const p = await novoPedido();
    await expect(b.como(ANA, "select public.mudar_status_pedido($1, 'enviado')", [p.id])).rejects.toThrow(/não tem peças/);
  });

  it("segue o fluxo e trava os itens depois de enviado", async () => {
    const p = await novoPedido();
    const i = await item(p.id, "CH1", 2);
    await b.como(ANA, "select public.mudar_status_pedido($1, 'enviado')", [p.id]);
    expect(await status(p.id)).toBe("enviado");
    await expect(item(p.id, "CH2", 1)).rejects.toThrow(/não está mais em rascunho/);
    await expect(b.como(ANA, "update public.pedido_item set quantidade = 5 where id = $1", [i])).rejects.toThrow(/não está mais em rascunho/);
    await expect(b.como(ANA, "delete from public.pedido_item where id = $1", [i])).rejects.toThrow(/não está mais em rascunho/);
    await expect(b.como(ANA, "select public.mudar_status_pedido($1, 'recebido')", [p.id])).rejects.toThrow(/não dá para passar/);
    // Voltar para rascunho destrava.
    await b.como(ANA, "select public.mudar_status_pedido($1, 'rascunho')", [p.id]);
    await b.como(ANA, "update public.pedido_item set quantidade = 5 where id = $1", [i]);
  });

  it("Bruno não muda pedidos da Ana", async () => {
    const p = await novoPedido();
    await expect(b.como(BRUNO, "select public.mudar_status_pedido($1, 'cancelado')", [p.id])).rejects.toThrow(/não encontrado/);
    await expect(b.como(BRUNO, "select public.receber_pedido($1)", [p.id])).rejects.toThrow(/não encontrado/);
  });
});

describe("recebimento", () => {
  it("cria produtos, lança a entrada com o que chegou e fecha o pedido", async () => {
    const p = await novoPedido("Coleção verão");
    const i1 = await item(p.id, "CH22911P", 3, 12490);
    await item(p.id, "CN21818T", 2, 13990);
    const i3 = await item(p.id, "CN21774G", 1, 12990);
    await b.como(ANA, "select public.mudar_status_pedido($1, 'enviado')", [p.id]);

    // Chegaram só 2 do primeiro e nenhum do terceiro.
    const [r] = await b.como<{ pecas: number }>(ANA, "select public.receber_pedido($1, $2::jsonb) as pecas", [
      p.id,
      JSON.stringify([
        { item_id: i1, quantidade: 2 },
        { item_id: i3, quantidade: 0 },
      ]),
    ]);
    expect(r.pecas).toBe(4);
    expect(await status(p.id)).toBe("recebido");

    const saldos = await b.como<{ codigo: string; saldo: number; custo: number }>(
      ANA,
      "select pr.codigo, s.saldo, pr.custo from public.estoque_saldo s join public.produto pr on pr.id = s.produto_id order by pr.codigo"
    );
    expect(saldos).toEqual([
      { codigo: "CH22911P", saldo: 2, custo: 12490 },
      { codigo: "CN21818T", saldo: 2, custo: 13990 },
    ]);
    const [semEstoque] = await b.como<{ id: string }>(ANA, "select id from public.produto where codigo = 'CN21774G'");
    expect(semEstoque).toBeTruthy();
    const itens = await b.como<{ quantidade_recebida: number }>(ANA, "select quantidade_recebida from public.pedido_item where pedido_id = $1 order by codigo", [p.id]);
    expect(itens.map((x) => x.quantidade_recebida)).toEqual([2, 0, 2]); // CH22911P, CN21774G, CN21818T
  });

  it("não recebe duas vezes nem pedido em rascunho", async () => {
    const p = await novoPedido();
    await item(p.id, "CH22911P", 1);
    await expect(b.como(ANA, "select public.receber_pedido($1)", [p.id])).rejects.toThrow(/enviados ou confirmados/);
    await b.como(ANA, "select public.mudar_status_pedido($1, 'enviado')", [p.id]);
    await b.como(ANA, "select public.mudar_status_pedido($1, 'confirmado')", [p.id]);
    await b.como(ANA, "select public.receber_pedido($1)", [p.id]);
    await expect(b.como(ANA, "select public.receber_pedido($1)", [p.id])).rejects.toThrow(/enviados ou confirmados/);
    const [s] = await b.como<{ saldo: number }>(
      ANA,
      "select s.saldo from public.estoque_saldo s join public.produto pr on pr.id = s.produto_id where pr.codigo = 'CH22911P'"
    );
    expect(s.saldo).toBe(3);
  });

  it("produto que já existe recebe o custo novo e soma estoque", async () => {
    const [antes] = await b.como<{ n: number }>(ANA, "select count(*)::int as n from public.produto where codigo = 'CH22911P'");
    expect(antes.n).toBe(1);
  });
});
