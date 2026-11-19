// Vendas no banco: registro com baixa de estoque, idempotência, parcelas, devolução,
// cancelamento e isolamento entre revendedores e equipe.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { criarBanco, type Banco } from "./supabase-simulado";

const ANA = "00000000-0000-4000-8000-00000000000a";
const BRUNO = "00000000-0000-4000-8000-00000000000b";
const CARLA = "00000000-0000-4000-8000-00000000000c"; // equipe da Ana

let b: Banco;
let revAna: string;
let revBruno: string;
let p1: string;
let p2: string;

async function produto(codigo: string, estoque: number) {
  const [{ id }] = await b.como<{ id: string }>(ANA, "insert into public.produto (revendedor_id, codigo, custo) values ($1, $2, 10000) returning id", [revAna, codigo]);
  if (estoque > 0) {
    await b.como(
      ANA,
      "insert into public.estoque_movimento (revendedor_id, produto_id, tipo, quantidade, origem_tipo, chave_idempotencia, criado_por) values ($1, $2, 'ajuste', $3, 'manual', $4, $5)",
      [revAna, id, estoque, `ajuste:${randomUUID()}`, ANA]
    );
  }
  return id;
}

const saldo = (id: string) => b.admin<{ saldo: number }>("select coalesce(sum(quantidade), 0)::int as saldo from public.estoque_movimento where produto_id = $1", [id]).then((r) => r[0].saldo);

interface Item {
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  desconto_rateado?: number;
  custo_unitario: number;
  comissao?: number;
}

function dados(itens: Item[], recebimentos: { valor: number; vencimento: string; recebido: boolean }[], extra: Record<string, unknown> = {}) {
  const comissao = itens.reduce((s, i) => s + (i.comissao ?? 0), 0);
  return {
    chave: randomUUID(),
    data: "2026-11-19",
    forma_pagamento: "pix",
    comissoes: comissao ? [{ nome: "Indicação", percentual_bp: 1000, valor: comissao }] : [],
    itens,
    recebimentos,
    ...extra,
  };
}

const registrar = (usuario: string, d: unknown, revendedor = revAna) =>
  b.como<{ id: string }>(usuario, "select public.registrar_venda($1, $2) as id", [revendedor, JSON.stringify(d)]).then((r) => r[0].id);

beforeAll(async () => {
  b = await criarBanco();
  for (const u of [ANA, BRUNO, CARLA]) await b.criarUsuario(u);
  [{ id: revAna }] = await b.como<{ id: string }>(ANA, "select public.criar_revendedor('Ana') as id");
  [{ id: revBruno }] = await b.como<{ id: string }>(BRUNO, "select public.criar_revendedor('Bruno') as id");
  await b.admin(
    "insert into public.membro (usuario_id, organizacao_id, revendedor_id, papel) select $1, organizacao_id, id, 'equipe' from public.revendedor where id = $2",
    [CARLA, revAna]
  );
  p1 = await produto("CH1", 5);
  p2 = await produto("CH2", 2);
});

describe("registrar venda", () => {
  it("grava itens, baixa o estoque, numera e cria as parcelas", async () => {
    const d = dados(
      [
        { produto_id: p1, quantidade: 2, preco_unitario: 20000, desconto_rateado: 1000, custo_unitario: 10500, comissao: 4000 },
        { produto_id: p2, quantidade: 1, preco_unitario: 15000, desconto_rateado: 500, custo_unitario: 10500, comissao: 1500 },
      ],
      [
        { valor: 33500, vencimento: "2026-11-19", recebido: true },
        { valor: 20000, vencimento: "2026-12-19", recebido: false },
      ]
    );
    const id = await registrar(ANA, d);
    const [v] = await b.como<Record<string, number | string>>(ANA, "select numero, pecas, total_bruto, desconto, total_liquido, custo_total, comissao_total, lucro, status from public.venda where id = $1", [id]);
    expect(v).toEqual({ numero: 1, pecas: 3, total_bruto: 55000, desconto: 1500, total_liquido: 53500, custo_total: 31500, comissao_total: 5500, lucro: 16500, status: "concluida" });
    expect(await saldo(p1)).toBe(3);
    expect(await saldo(p2)).toBe(1);
    const parcelas = await b.como(ANA, "select parcela, valor, status, recebido_em::text from public.recebimento where venda_id = $1 order by parcela", [id]);
    expect(parcelas).toEqual([
      { parcela: 1, valor: 33500, status: "recebido", recebido_em: "2026-11-19" },
      { parcela: 2, valor: 20000, status: "pendente", recebido_em: null },
    ]);
    // Repetir o envio devolve a mesma venda e não baixa o estoque de novo.
    expect(await registrar(ANA, d)).toBe(id);
    expect(await saldo(p1)).toBe(3);
  });

  it("recusa estoque insuficiente sem gravar nada", async () => {
    const antes = await b.admin<{ n: number }>("select count(*)::int as n from public.venda");
    await expect(registrar(ANA, dados([{ produto_id: p2, quantidade: 5, preco_unitario: 100, custo_unitario: 50 }], [{ valor: 500, vencimento: "2026-11-19", recebido: true }]))).rejects.toThrow(
      /estoque insuficiente para CH2/
    );
    expect(await b.admin<{ n: number }>("select count(*)::int as n from public.venda")).toEqual(antes);
  });

  it("recusa parcelas que não somam o total e comissões que não batem", async () => {
    await expect(registrar(ANA, dados([{ produto_id: p1, quantidade: 1, preco_unitario: 100, custo_unitario: 50 }], [{ valor: 90, vencimento: "2026-11-19", recebido: true }]))).rejects.toThrow(/soma das parcelas/);
    const d = dados([{ produto_id: p1, quantidade: 1, preco_unitario: 100, custo_unitario: 50, comissao: 10 }], [{ valor: 100, vencimento: "2026-11-19", recebido: true }]);
    d.comissoes = [{ nome: "X", percentual_bp: 1000, valor: 99 }];
    await expect(registrar(ANA, d)).rejects.toThrow(/comissões não batem/);
  });

  it("recusa peça ou cliente de outro revendedor", async () => {
    const [{ id: cliBruno }] = await b.como<{ id: string }>(BRUNO, "insert into public.cliente (revendedor_id, nome) values ($1, 'Zé') returning id", [revBruno]);
    await expect(
      registrar(ANA, dados([{ produto_id: p1, quantidade: 1, preco_unitario: 100, custo_unitario: 50 }], [{ valor: 100, vencimento: "2026-11-19", recebido: true }], { cliente_id: cliBruno }))
    ).rejects.toThrow(/cliente não encontrado/);
    await expect(registrar(BRUNO, dados([{ produto_id: p1, quantidade: 1, preco_unitario: 100, custo_unitario: 50 }], [{ valor: 100, vencimento: "2026-11-19", recebido: true }]), revBruno)).rejects.toThrow(
      /peça não encontrada/
    );
  });

  it("só o dono registra; ninguém grava venda direto na tabela", async () => {
    const d = dados([{ produto_id: p1, quantidade: 1, preco_unitario: 100, custo_unitario: 50 }], [{ valor: 100, vencimento: "2026-11-19", recebido: true }]);
    await expect(registrar(BRUNO, d)).rejects.toThrow(/sem permissão/);
    await expect(registrar(CARLA, d)).rejects.toThrow(/sem permissão/);
    await expect(
      b.como(ANA, "insert into public.venda (revendedor_id, numero, data, forma_pagamento, pecas, total_bruto, total_liquido, custo_total, lucro, chave_idempotencia) values ($1, 99, now(), 'pix', 1, 1, 1, 0, 1, 'xxxxxxxxxx')", [revAna])
    ).rejects.toThrow(/permission denied/);
  });
});

describe("leitura", () => {
  it("Bruno e a equipe não leem as vendas da Ana", async () => {
    for (const tabela of ["venda", "venda_item", "recebimento", "venda_devolucao"]) {
      expect(await b.como(BRUNO, `select * from public.${tabela}`)).toEqual([]);
      expect(await b.como(CARLA, `select * from public.${tabela}`)).toEqual([]);
    }
  });

  it("a equipe vê e cadastra clientes; Bruno não vê os da Ana", async () => {
    await b.como(CARLA, "insert into public.cliente (revendedor_id, nome) values ($1, 'Maria')", [revAna]);
    expect(await b.como(ANA, "select nome from public.cliente")).toEqual([{ nome: "Maria" }]);
    expect((await b.como(BRUNO, "select nome from public.cliente")).map((c) => c.nome)).toEqual(["Zé"]);
    expect(await b.como(CARLA, "delete from public.cliente returning id")).toEqual([]);
  });

  it("a equipe não lança movimentos de estoque", async () => {
    await expect(
      b.como(CARLA, "insert into public.estoque_movimento (revendedor_id, produto_id, tipo, quantidade, origem_tipo, chave_idempotencia, criado_por) values ($1, $2, 'ajuste', 10, 'manual', 'x1', $3)", [revAna, p1, CARLA])
    ).rejects.toThrow(/row-level security/);
  });
});

describe("recebimentos, devolução e cancelamento", () => {
  let p3: string;
  beforeAll(async () => {
    p3 = await produto("CH3", 10);
  });

  async function vendaAPrazo() {
    // 3 peças de R$ 100,00 com R$ 10,00 de desconto: entrada de R$ 90,00 e duas parcelas de R$ 100,00.
    return registrar(
      ANA,
      dados(
        [{ produto_id: p3, quantidade: 3, preco_unitario: 10000, desconto_rateado: 1000, custo_unitario: 5000, comissao: 3000 }],
        [
          { valor: 9000, vencimento: "2026-11-19", recebido: true },
          { valor: 10000, vencimento: "2026-12-19", recebido: false },
          { valor: 10000, vencimento: "2027-01-19", recebido: false },
        ],
        { forma_pagamento: "crediario" }
      )
    );
  }

  it("marca e desmarca parcela recebida", async () => {
    const id = await vendaAPrazo();
    const [{ id: parcela }] = await b.como<{ id: string }>(ANA, "select id from public.recebimento where venda_id = $1 and parcela = 2", [id]);
    await b.como(ANA, "select public.marcar_recebimento($1, '2026-12-20')", [parcela]);
    expect(await b.como(ANA, "select status from public.recebimento where id = $1", [parcela])).toEqual([{ status: "recebido" }]);
    await b.como(ANA, "select public.marcar_recebimento($1, null)", [parcela]);
    expect(await b.como(ANA, "select status, recebido_em from public.recebimento where id = $1", [parcela])).toEqual([{ status: "pendente", recebido_em: null }]);
    await expect(b.como(BRUNO, "select public.marcar_recebimento($1, '2026-12-20')", [parcela])).rejects.toThrow(/não encontrada/);
  });

  it("devolução parcial volta o estoque e abate das últimas parcelas", async () => {
    const id = await vendaAPrazo();
    const antes = await saldo(p3);
    const [{ id: item }] = await b.como<{ id: string }>(ANA, "select id from public.venda_item where venda_id = $1", [id]);
    const [{ r }] = await b.como<{ r: Record<string, number> }>(ANA, "select public.devolver_venda($1, $2, 'não gostou', '2026-11-25', true) as r", [id, JSON.stringify([{ item_id: item, quantidade: 1 }])]);
    // (30000 - 1000) / 3 = 9666,67 → 9667; comissão 3000 / 3 = 1000.
    expect(r).toEqual({ pecas: 1, receita: 9667, abatido: 9667, reembolso: 0, comissao_revertida: 1000 });
    expect(await saldo(p3)).toBe(antes + 1);
    expect(await b.como(ANA, "select parcela, valor, status from public.recebimento where venda_id = $1 order by parcela", [id])).toEqual([
      { parcela: 1, valor: 9000, status: "recebido" },
      { parcela: 2, valor: 10000, status: "pendente" },
      { parcela: 3, valor: 333, status: "pendente" },
    ]);
    const [v] = await b.como(ANA, "select status, devolvido_pecas, devolvido_receita, devolvido_custo, comissao_revertida from public.venda where id = $1", [id]);
    expect(v).toEqual({ status: "parcialmente_devolvida", devolvido_pecas: 1, devolvido_receita: 9667, devolvido_custo: 5000, comissao_revertida: 1000 });

    // Devolver o resto: as parcelas pendentes somem e o que passar vira reembolso.
    const [{ r: r2 }] = await b.como<{ r: Record<string, number> }>(ANA, "select public.devolver_venda($1, $2, 'trocou de ideia', '2026-11-26', false) as r", [id, JSON.stringify([{ item_id: item, quantidade: 2 }])]);
    expect(r2).toEqual({ pecas: 2, receita: 19333, abatido: 10333, reembolso: 9000, comissao_revertida: 0 });
    expect(await b.como(ANA, "select status from public.venda where id = $1", [id])).toEqual([{ status: "devolvida" }]);
    await expect(b.como(ANA, "select public.devolver_venda($1, $2, 'de novo', '2026-11-26', false)", [id, JSON.stringify([{ item_id: item, quantidade: 1 }])])).rejects.toThrow(
      /só dá para devolver/
    );
  });

  it("não devolve mais do que foi vendido nem antes da venda", async () => {
    const id = await vendaAPrazo();
    const [{ id: item }] = await b.como<{ id: string }>(ANA, "select id from public.venda_item where venda_id = $1", [id]);
    await expect(b.como(ANA, "select public.devolver_venda($1, $2, 'x', '2026-11-25', true)", [id, JSON.stringify([{ item_id: item, quantidade: 4 }])])).rejects.toThrow(/só restam 3/);
    await expect(b.como(ANA, "select public.devolver_venda($1, $2, 'x', '2026-11-01', true)", [id, JSON.stringify([{ item_id: item, quantidade: 1 }])])).rejects.toThrow(/antes da venda/);
  });

  it("cancelamento volta o estoque, cancela parcelas e informa o reembolso", async () => {
    const id = await vendaAPrazo();
    const antes = await saldo(p3);
    const [{ r }] = await b.como<{ r: Record<string, number> }>(ANA, "select public.cancelar_venda($1, 'desistiu', false) as r", [id]);
    expect(r).toEqual({ reembolso: 9000 });
    expect(await saldo(p3)).toBe(antes + 3);
    expect(await b.como(ANA, "select status, comissao_revertida from public.venda where id = $1", [id])).toEqual([{ status: "cancelada", comissao_revertida: 0 }]);
    expect((await b.como<{ status: string }>(ANA, "select status from public.recebimento where venda_id = $1 order by parcela", [id])).map((x) => x.status)).toEqual(["recebido", "cancelado", "cancelado"]);
    await expect(b.como(ANA, "select public.cancelar_venda($1, 'de novo', false)", [id])).rejects.toThrow(/já está cancelada/);
    await expect(b.como(BRUNO, "select public.cancelar_venda($1, 'x', false)", [(await vendaAPrazo())])).rejects.toThrow(/não encontrada/);
  });
});

describe("giro do estoque", () => {
  it("mostra saldo e última venda só do próprio revendedor", async () => {
    const giro = await b.como<{ produto_id: string; saldo: number; ultima_venda: string | null }>(ANA, "select produto_id, saldo, ultima_venda from public.estoque_giro where produto_id = $1", [p1]);
    expect(giro).toHaveLength(1);
    expect(giro[0].saldo).toBe(await saldo(p1));
    expect(giro[0].ultima_venda).not.toBeNull();
    expect(await b.como(BRUNO, "select * from public.estoque_giro where revendedor_id = $1", [revAna])).toEqual([]);
  });
});
