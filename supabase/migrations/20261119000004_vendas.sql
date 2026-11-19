-- Clientes, vendas, recebimentos (vendas a prazo) e devoluções.
--
-- Vendas, itens, recebimentos e devoluções só são gravados pelas funções deste arquivo
-- (security definer, conferindo o dono). O aplicativo só lê essas tabelas. Assim o estoque,
-- os totais e as parcelas nunca ficam inconsistentes entre si.
-- Os valores de cada item (preço, custo, comissão) são calculados pelo servidor do aplicativo
-- com packages/regras e conferidos aqui (somas, estoque, dono dos registros).

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------

create table public.cliente (
  id uuid primary key default gen_random_uuid(),
  revendedor_id uuid not null references public.revendedor (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 120),
  telefone text check (telefone is null or length(telefone) <= 30),
  email text check (email is null or length(email) <= 120),
  documento text check (documento is null or length(documento) <= 20),
  cidade text check (cidade is null or length(cidade) <= 80),
  aniversario date,
  observacao text check (observacao is null or length(observacao) <= 1000),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index cliente_revendedor_idx on public.cliente (revendedor_id, nome);

alter table public.cliente enable row level security;

-- A equipe também atende clientes: lê, cadastra e edita. Só o dono exclui.
create policy cliente_leitura on public.cliente for select to authenticated
  using ((select privado.eh_membro(revendedor_id)));
create policy cliente_insercao on public.cliente for insert to authenticated
  with check ((select privado.eh_membro(revendedor_id)));
create policy cliente_edicao on public.cliente for update to authenticated
  using ((select privado.eh_membro(revendedor_id))) with check ((select privado.eh_membro(revendedor_id)));
create policy cliente_remocao on public.cliente for delete to authenticated
  using ((select privado.eh_dono(revendedor_id)));

-- ---------------------------------------------------------------------------
-- Vendas
-- ---------------------------------------------------------------------------

create table public.venda (
  id uuid primary key default gen_random_uuid(),
  revendedor_id uuid not null references public.revendedor (id) on delete cascade,
  numero integer not null,
  cliente_id uuid references public.cliente (id) on delete set null,
  data date not null,
  forma_pagamento text not null check (forma_pagamento in ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia', 'boleto', 'crediario', 'outro')),
  status text not null default 'concluida' check (status in ('concluida', 'parcialmente_devolvida', 'devolvida', 'cancelada')),
  pecas integer not null check (pecas > 0),
  total_bruto integer not null check (total_bruto >= 0),
  desconto integer not null default 0 check (desconto between 0 and total_bruto),
  total_liquido integer not null,
  custo_total integer not null check (custo_total >= 0),
  -- [{"nome": "Indicação", "percentual_bp": 1000, "valor": 2706}]
  comissoes jsonb not null default '[]'::jsonb,
  comissao_total integer not null default 0 check (comissao_total >= 0),
  lucro integer not null,
  devolvido_pecas integer not null default 0 check (devolvido_pecas between 0 and pecas),
  devolvido_receita integer not null default 0 check (devolvido_receita >= 0),
  devolvido_custo integer not null default 0 check (devolvido_custo >= 0),
  comissao_revertida integer not null default 0 check (comissao_revertida between 0 and comissao_total),
  observacao text check (observacao is null or length(observacao) <= 500),
  motivo_cancelamento text check (motivo_cancelamento is null or length(motivo_cancelamento) <= 200),
  cancelada_em timestamptz,
  chave_idempotencia text not null check (length(chave_idempotencia) between 8 and 120),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  check (total_liquido = total_bruto - desconto),
  check (lucro = total_liquido - custo_total - comissao_total),
  unique (revendedor_id, numero),
  unique (revendedor_id, chave_idempotencia)
);
create index venda_revendedor_data_idx on public.venda (revendedor_id, data desc, numero desc);
create index venda_cliente_idx on public.venda (cliente_id);

create table public.venda_item (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.venda (id) on delete cascade,
  revendedor_id uuid not null references public.revendedor (id) on delete cascade,
  produto_id uuid references public.produto (id) on delete set null,
  codigo text not null,
  descricao text,
  imagem_path text,
  quantidade integer not null check (quantidade between 1 and 10000),
  quantidade_devolvida integer not null default 0,
  preco_unitario integer not null check (preco_unitario >= 0),
  subtotal integer not null,
  desconto_rateado integer not null default 0,
  custo_unitario integer not null check (custo_unitario >= 0),
  custo_total integer not null,
  comissao integer not null default 0 check (comissao >= 0),
  check (quantidade_devolvida between 0 and quantidade),
  check (subtotal = preco_unitario * quantidade),
  check (desconto_rateado between 0 and subtotal),
  check (custo_total = custo_unitario * quantidade),
  unique (venda_id, produto_id)
);
create index venda_item_venda_idx on public.venda_item (venda_id);
create index venda_item_revendedor_idx on public.venda_item (revendedor_id);
create index venda_item_produto_idx on public.venda_item (produto_id);

create table public.recebimento (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.venda (id) on delete cascade,
  revendedor_id uuid not null references public.revendedor (id) on delete cascade,
  parcela integer not null check (parcela >= 1),
  valor integer not null check (valor >= 0),
  vencimento date not null,
  status text not null default 'pendente' check (status in ('pendente', 'recebido', 'cancelado')),
  recebido_em date,
  check ((status = 'recebido') = (recebido_em is not null)),
  unique (venda_id, parcela)
);
create index recebimento_venda_idx on public.recebimento (venda_id);
create index recebimento_pendente_idx on public.recebimento (revendedor_id, vencimento) where status = 'pendente';

create table public.venda_devolucao (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.venda (id) on delete cascade,
  revendedor_id uuid not null references public.revendedor (id) on delete cascade,
  data date not null,
  motivo text not null check (length(motivo) between 1 and 200),
  -- [{"item_id": "...", "codigo": "...", "quantidade": 1, "receita": 100, "custo": 50, "comissao": 10}]
  itens jsonb not null,
  pecas integer not null check (pecas > 0),
  receita integer not null check (receita >= 0),
  custo integer not null check (custo >= 0),
  comissao_revertida integer not null default 0 check (comissao_revertida >= 0),
  -- Parte da receita tirada das parcelas ainda não pagas; o resto volta ao cliente.
  abatido integer not null default 0 check (abatido >= 0),
  reembolso integer not null default 0 check (reembolso >= 0),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  check (abatido + reembolso = receita)
);
create index venda_devolucao_venda_idx on public.venda_devolucao (venda_id);
create index venda_devolucao_revendedor_idx on public.venda_devolucao (revendedor_id);

alter table public.venda enable row level security;
alter table public.venda_item enable row level security;
alter table public.recebimento enable row level security;
alter table public.venda_devolucao enable row level security;

-- Vendas têm custo e lucro: só o dono lê. Escrita só pelas funções abaixo.
create policy venda_leitura on public.venda for select to authenticated
  using ((select privado.eh_dono(revendedor_id)));
create policy venda_item_leitura on public.venda_item for select to authenticated
  using ((select privado.eh_dono(revendedor_id)));
create policy recebimento_leitura on public.recebimento for select to authenticated
  using ((select privado.eh_dono(revendedor_id)));
create policy venda_devolucao_leitura on public.venda_devolucao for select to authenticated
  using ((select privado.eh_dono(revendedor_id)));

revoke insert, update, delete on public.venda, public.venda_item, public.recebimento, public.venda_devolucao from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------

-- Registra uma venda: confere estoque e somas, numera, baixa o estoque e cria as parcelas.
-- Idempotente pela chave: repetir o envio devolve a venda já gravada.
-- p_dados: {
--   "chave": "...", "data": "2026-11-19", "forma_pagamento": "pix", "cliente_id": null, "observacao": null,
--   "comissoes": [{"nome": "...", "percentual_bp": 1000, "valor": 0}],
--   "itens": [{"produto_id", "quantidade", "preco_unitario", "desconto_rateado", "custo_unitario", "comissao"}],
--   "recebimentos": [{"valor", "vencimento", "recebido"}]
-- }
create or replace function public.registrar_venda(p_revendedor uuid, p_dados jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_chave text := p_dados ->> 'chave';
  v_data date := (p_dados ->> 'data')::date;
  v_cliente uuid := nullif(p_dados ->> 'cliente_id', '')::uuid;
  v_venda uuid;
  v_numero integer;
  v_item jsonb;
  v_rec jsonb;
  v_produto record;
  v_saldo integer;
  v_qtd integer;
  v_item_id uuid;
  v_pecas integer := 0;
  v_bruto integer := 0;
  v_desconto integer := 0;
  v_custo integer := 0;
  v_comissao integer := 0;
  v_recebido integer := 0;
  v_parcela integer := 0;
  v_vistos uuid[] := '{}';
begin
  if v_usuario is null or not (select privado.eh_dono(p_revendedor)) then
    raise exception 'sem permissão para registrar vendas' using errcode = '42501';
  end if;
  if v_chave is null then
    raise exception 'chave da venda ausente';
  end if;
  if v_data is null then
    raise exception 'informe a data da venda';
  end if;

  -- Uma venda por vez por revendedor: protege o estoque e a numeração.
  perform pg_advisory_xact_lock(hashtext('estoque:' || p_revendedor::text));

  select v.id into v_venda from public.venda v where v.revendedor_id = p_revendedor and v.chave_idempotencia = v_chave;
  if v_venda is not null then
    return v_venda;
  end if;

  if v_cliente is not null and not exists (select 1 from public.cliente c where c.id = v_cliente and c.revendedor_id = p_revendedor) then
    raise exception 'cliente não encontrado';
  end if;
  if jsonb_typeof(p_dados -> 'itens') is distinct from 'array' or jsonb_array_length(p_dados -> 'itens') = 0 then
    raise exception 'adicione ao menos uma peça';
  end if;

  -- Primeira passada: confere cada item e soma.
  for v_item in select * from jsonb_array_elements(p_dados -> 'itens') loop
    v_qtd := (v_item ->> 'quantidade')::integer;
    if v_qtd is null or v_qtd < 1 or v_qtd > 10000 then
      raise exception 'quantidade inválida';
    end if;
    if (v_item ->> 'produto_id')::uuid = any (v_vistos) then
      raise exception 'a mesma peça aparece duas vezes na venda';
    end if;
    v_vistos := v_vistos || (v_item ->> 'produto_id')::uuid;
    select p.id, p.codigo into v_produto from public.produto p
     where p.id = (v_item ->> 'produto_id')::uuid and p.revendedor_id = p_revendedor;
    if v_produto.id is null then
      raise exception 'peça não encontrada';
    end if;
    select coalesce(sum(m.quantidade), 0) into v_saldo from public.estoque_movimento m where m.produto_id = v_produto.id;
    if v_saldo < v_qtd then
      raise exception 'estoque insuficiente para % (tem %, pediu %)', v_produto.codigo, v_saldo, v_qtd;
    end if;
    v_pecas := v_pecas + v_qtd;
    v_bruto := v_bruto + (v_item ->> 'preco_unitario')::integer * v_qtd;
    v_desconto := v_desconto + coalesce((v_item ->> 'desconto_rateado')::integer, 0);
    v_custo := v_custo + (v_item ->> 'custo_unitario')::integer * v_qtd;
    v_comissao := v_comissao + coalesce((v_item ->> 'comissao')::integer, 0);
  end loop;

  if coalesce((select sum((c ->> 'valor')::integer) from jsonb_array_elements(coalesce(p_dados -> 'comissoes', '[]'::jsonb)) c), 0) <> v_comissao then
    raise exception 'as comissões não batem com os itens';
  end if;
  select coalesce(sum((r ->> 'valor')::integer), 0) into v_recebido
    from jsonb_array_elements(coalesce(p_dados -> 'recebimentos', '[]'::jsonb)) r;
  if v_recebido <> v_bruto - v_desconto then
    raise exception 'a soma das parcelas precisa ser igual ao total da venda';
  end if;

  select coalesce(max(v.numero), 0) + 1 into v_numero from public.venda v where v.revendedor_id = p_revendedor;
  insert into public.venda
    (revendedor_id, numero, cliente_id, data, forma_pagamento, pecas, total_bruto, desconto, total_liquido,
     custo_total, comissoes, comissao_total, lucro, observacao, chave_idempotencia, criado_por)
  values
    (p_revendedor, v_numero, v_cliente, v_data, p_dados ->> 'forma_pagamento', v_pecas, v_bruto, v_desconto, v_bruto - v_desconto,
     v_custo, coalesce(p_dados -> 'comissoes', '[]'::jsonb), v_comissao, v_bruto - v_desconto - v_custo - v_comissao,
     nullif(trim(p_dados ->> 'observacao'), ''), v_chave, v_usuario)
  returning id into v_venda;

  -- Segunda passada: grava os itens e baixa o estoque.
  for v_item in select * from jsonb_array_elements(p_dados -> 'itens') loop
    v_qtd := (v_item ->> 'quantidade')::integer;
    insert into public.venda_item
      (venda_id, revendedor_id, produto_id, codigo, descricao, imagem_path, quantidade, preco_unitario, subtotal,
       desconto_rateado, custo_unitario, custo_total, comissao)
    select v_venda, p_revendedor, p.id, p.codigo, p.descricao, p.imagem_path, v_qtd,
           (v_item ->> 'preco_unitario')::integer, (v_item ->> 'preco_unitario')::integer * v_qtd,
           coalesce((v_item ->> 'desconto_rateado')::integer, 0),
           (v_item ->> 'custo_unitario')::integer, (v_item ->> 'custo_unitario')::integer * v_qtd,
           coalesce((v_item ->> 'comissao')::integer, 0)
      from public.produto p where p.id = (v_item ->> 'produto_id')::uuid
    returning id into v_item_id;

    insert into public.estoque_movimento
      (revendedor_id, produto_id, tipo, quantidade, custo_unitario, origem_tipo, origem_id, motivo, chave_idempotencia, criado_por)
    values
      (p_revendedor, (v_item ->> 'produto_id')::uuid, 'venda', -v_qtd, (v_item ->> 'custo_unitario')::integer, 'venda', v_venda,
       'Venda nº ' || v_numero, 'venda:' || v_venda || ':item:' || v_item_id, v_usuario);
  end loop;

  for v_rec in select * from jsonb_array_elements(coalesce(p_dados -> 'recebimentos', '[]'::jsonb)) loop
    if (v_rec ->> 'valor')::integer <= 0 then
      raise exception 'cada parcela precisa ter valor maior que zero';
    end if;
    if (v_rec ->> 'vencimento')::date < v_data and not coalesce((v_rec ->> 'recebido')::boolean, false) then
      raise exception 'parcela a receber com vencimento antes da venda';
    end if;
    v_parcela := v_parcela + 1;
    insert into public.recebimento (venda_id, revendedor_id, parcela, valor, vencimento, status, recebido_em)
    values (v_venda, p_revendedor, v_parcela, (v_rec ->> 'valor')::integer, (v_rec ->> 'vencimento')::date,
            case when coalesce((v_rec ->> 'recebido')::boolean, false) then 'recebido' else 'pendente' end,
            case when coalesce((v_rec ->> 'recebido')::boolean, false) then (v_rec ->> 'vencimento')::date end);
  end loop;

  insert into public.auditoria (revendedor_id, usuario_id, acao, tabela, registro_id, depois)
  values (p_revendedor, v_usuario, 'registrar', 'venda', v_venda::text,
          jsonb_build_object('numero', v_numero, 'total', v_bruto - v_desconto, 'pecas', v_pecas));
  return v_venda;
end;
$$;

-- Marca uma parcela como recebida (p_recebido_em) ou volta para pendente (null).
create or replace function public.marcar_recebimento(p_recebimento uuid, p_recebido_em date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec record;
begin
  select r.id, r.revendedor_id, r.status into v_rec from public.recebimento r where r.id = p_recebimento for update;
  if v_rec.id is null or not (select privado.eh_dono(v_rec.revendedor_id)) then
    raise exception 'parcela não encontrada' using errcode = 'P0002';
  end if;
  if v_rec.status = 'cancelado' then
    raise exception 'parcela cancelada não pode ser recebida';
  end if;
  update public.recebimento
     set status = case when p_recebido_em is null then 'pendente' else 'recebido' end,
         recebido_em = p_recebido_em
   where id = p_recebimento;
  insert into public.auditoria (revendedor_id, usuario_id, acao, tabela, registro_id, depois)
  values (v_rec.revendedor_id, (select auth.uid()), case when p_recebido_em is null then 'estornar' else 'receber' end,
          'recebimento', p_recebimento::text, jsonb_build_object('recebido_em', p_recebido_em));
end;
$$;

-- Cancela uma venda sem devoluções: as peças voltam ao estoque e as parcelas pendentes são
-- canceladas. O que o cliente já pagou é devolvido a ele (valor retornado em "reembolso").
-- p_reverter_comissoes: false mantém as comissões como despesa (já combinadas ou pagas).
create or replace function public.cancelar_venda(p_venda uuid, p_motivo text, p_reverter_comissoes boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venda record;
  v_item record;
  v_usuario uuid := (select auth.uid());
  v_reembolso integer;
begin
  select v.id, v.revendedor_id, v.status, v.numero, v.comissao_total into v_venda from public.venda v where v.id = p_venda for update;
  if v_venda.id is null or not (select privado.eh_dono(v_venda.revendedor_id)) then
    raise exception 'venda não encontrada' using errcode = 'P0002';
  end if;
  if v_venda.status = 'cancelada' then
    raise exception 'esta venda já está cancelada';
  end if;
  if v_venda.status <> 'concluida' then
    raise exception 'venda com devolução não pode ser cancelada; devolva as peças restantes';
  end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'informe o motivo do cancelamento';
  end if;
  if p_reverter_comissoes is null then
    raise exception 'informe se as comissões devem ser revertidas';
  end if;

  perform pg_advisory_xact_lock(hashtext('estoque:' || v_venda.revendedor_id::text));
  for v_item in select i.id, i.produto_id, i.quantidade, i.custo_unitario from public.venda_item i where i.venda_id = p_venda loop
    if v_item.produto_id is not null then
      insert into public.estoque_movimento
        (revendedor_id, produto_id, tipo, quantidade, custo_unitario, origem_tipo, origem_id, motivo, chave_idempotencia, criado_por)
      values
        (v_venda.revendedor_id, v_item.produto_id, 'devolucao', v_item.quantidade, v_item.custo_unitario, 'venda', p_venda,
         'Cancelamento da venda nº ' || v_venda.numero, 'venda:' || p_venda || ':cancelamento:item:' || v_item.id, v_usuario)
      on conflict (revendedor_id, chave_idempotencia) do nothing;
    end if;
  end loop;

  update public.recebimento set status = 'cancelado' where venda_id = p_venda and status = 'pendente';
  select coalesce(sum(r.valor), 0) into v_reembolso from public.recebimento r where r.venda_id = p_venda and r.status = 'recebido';

  update public.venda
     set status = 'cancelada',
         motivo_cancelamento = trim(p_motivo),
         cancelada_em = now(),
         comissao_revertida = case when p_reverter_comissoes then comissao_total else 0 end
   where id = p_venda;

  insert into public.auditoria (revendedor_id, usuario_id, acao, tabela, registro_id, depois)
  values (v_venda.revendedor_id, v_usuario, 'cancelar', 'venda', p_venda::text,
          jsonb_build_object('motivo', trim(p_motivo), 'reverter_comissoes', p_reverter_comissoes, 'reembolso', v_reembolso));
  return jsonb_build_object('reembolso', v_reembolso);
end;
$$;

-- Devolve peças de uma venda. As peças voltam ao estoque; a receita devolvida sai primeiro das
-- parcelas ainda não pagas (da última para a primeira) e o resto é reembolso ao cliente.
-- Os valores seguem calcularDevolucaoItem de packages/regras (fatia acumulada).
-- p_itens: [{"item_id": "...", "quantidade": 1}]
create or replace function public.devolver_venda(
  p_venda uuid,
  p_itens jsonb,
  p_motivo text,
  p_data date,
  p_reverter_comissoes boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venda record;
  v_pedido jsonb;
  v_item record;
  v_rec record;
  v_qtd integer;
  v_usuario uuid := (select auth.uid());
  v_devolucao uuid := gen_random_uuid();
  v_receita_item integer;
  v_comissao_item integer;
  v_pecas integer := 0;
  v_receita integer := 0;
  v_custo integer := 0;
  v_comissao integer := 0;
  v_resto integer;
  v_abatido integer := 0;
  v_detalhe jsonb := '[]'::jsonb;
  v_vistos uuid[] := '{}';
  v_status text;
begin
  select v.id, v.revendedor_id, v.status, v.numero, v.data into v_venda from public.venda v where v.id = p_venda for update;
  if v_venda.id is null or not (select privado.eh_dono(v_venda.revendedor_id)) then
    raise exception 'venda não encontrada' using errcode = 'P0002';
  end if;
  if v_venda.status not in ('concluida', 'parcialmente_devolvida') then
    raise exception 'só dá para devolver peças de vendas concluídas';
  end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'informe o motivo da devolução';
  end if;
  if p_data is null or p_data < v_venda.data then
    raise exception 'a devolução não pode ser antes da venda';
  end if;
  if p_reverter_comissoes is null then
    raise exception 'informe se as comissões devem ser revertidas';
  end if;

  perform pg_advisory_xact_lock(hashtext('estoque:' || v_venda.revendedor_id::text));
  for v_pedido in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_qtd := (v_pedido ->> 'quantidade')::integer;
    if v_qtd is null or v_qtd = 0 then
      continue;
    end if;
    select i.* into v_item from public.venda_item i where i.id = (v_pedido ->> 'item_id')::uuid and i.venda_id = p_venda for update;
    if v_item.id is null then
      raise exception 'peça não pertence a esta venda';
    end if;
    if v_item.id = any (v_vistos) then
      raise exception 'peça repetida na devolução';
    end if;
    v_vistos := v_vistos || v_item.id;
    if v_qtd < 0 or v_qtd > v_item.quantidade - v_item.quantidade_devolvida then
      raise exception 'só restam % unidade(s) de % para devolver', v_item.quantidade - v_item.quantidade_devolvida, v_item.codigo;
    end if;

    v_receita_item := round((v_item.subtotal - v_item.desconto_rateado)::numeric * (v_item.quantidade_devolvida + v_qtd) / v_item.quantidade)
                    - round((v_item.subtotal - v_item.desconto_rateado)::numeric * v_item.quantidade_devolvida / v_item.quantidade);
    v_comissao_item := round(v_item.comissao::numeric * (v_item.quantidade_devolvida + v_qtd) / v_item.quantidade)
                     - round(v_item.comissao::numeric * v_item.quantidade_devolvida / v_item.quantidade);

    update public.venda_item set quantidade_devolvida = quantidade_devolvida + v_qtd where id = v_item.id;
    if v_item.produto_id is not null then
      insert into public.estoque_movimento
        (revendedor_id, produto_id, tipo, quantidade, custo_unitario, origem_tipo, origem_id, motivo, chave_idempotencia, criado_por)
      values
        (v_venda.revendedor_id, v_item.produto_id, 'devolucao', v_qtd, v_item.custo_unitario, 'venda', p_venda,
         'Devolução da venda nº ' || v_venda.numero, 'venda:' || p_venda || ':devolucao:' || v_devolucao || ':item:' || v_item.id, v_usuario);
    end if;

    v_pecas := v_pecas + v_qtd;
    v_receita := v_receita + v_receita_item;
    v_custo := v_custo + v_item.custo_unitario * v_qtd;
    v_comissao := v_comissao + v_comissao_item;
    v_detalhe := v_detalhe || jsonb_build_object('item_id', v_item.id, 'codigo', v_item.codigo, 'quantidade', v_qtd,
      'receita', v_receita_item, 'custo', v_item.custo_unitario * v_qtd, 'comissao', v_comissao_item);
  end loop;

  if v_pecas = 0 then
    raise exception 'escolha ao menos uma peça para devolver';
  end if;

  -- Tira a receita devolvida das parcelas pendentes, da última para a primeira.
  v_resto := v_receita;
  for v_rec in
    select r.id, r.valor from public.recebimento r
     where r.venda_id = p_venda and r.status = 'pendente'
     order by r.vencimento desc, r.parcela desc
  loop
    exit when v_resto = 0;
    if v_rec.valor <= v_resto then
      update public.recebimento set status = 'cancelado' where id = v_rec.id;
      v_resto := v_resto - v_rec.valor;
      v_abatido := v_abatido + v_rec.valor;
    else
      update public.recebimento set valor = valor - v_resto where id = v_rec.id;
      v_abatido := v_abatido + v_resto;
      v_resto := 0;
    end if;
  end loop;

  if exists (select 1 from public.venda_item i where i.venda_id = p_venda and i.quantidade_devolvida < i.quantidade) then
    v_status := 'parcialmente_devolvida';
  else
    v_status := 'devolvida';
  end if;
  update public.venda
     set status = v_status,
         devolvido_pecas = devolvido_pecas + v_pecas,
         devolvido_receita = devolvido_receita + v_receita,
         devolvido_custo = devolvido_custo + v_custo,
         comissao_revertida = comissao_revertida + case when p_reverter_comissoes then v_comissao else 0 end
   where id = p_venda;

  insert into public.venda_devolucao
    (id, venda_id, revendedor_id, data, motivo, itens, pecas, receita, custo, comissao_revertida, abatido, reembolso, criado_por)
  values
    (v_devolucao, p_venda, v_venda.revendedor_id, p_data, trim(p_motivo), v_detalhe, v_pecas, v_receita, v_custo,
     case when p_reverter_comissoes then v_comissao else 0 end, v_abatido, v_receita - v_abatido, v_usuario);

  insert into public.auditoria (revendedor_id, usuario_id, acao, tabela, registro_id, depois)
  values (v_venda.revendedor_id, v_usuario, 'devolver', 'venda', p_venda::text,
          jsonb_build_object('devolucao', v_devolucao, 'pecas', v_pecas, 'receita', v_receita));
  return jsonb_build_object('pecas', v_pecas, 'receita', v_receita, 'abatido', v_abatido, 'reembolso', v_receita - v_abatido,
                            'comissao_revertida', case when p_reverter_comissoes then v_comissao else 0 end);
end;
$$;

revoke all on function public.registrar_venda(uuid, jsonb) from public, anon;
revoke all on function public.marcar_recebimento(uuid, date) from public, anon;
revoke all on function public.cancelar_venda(uuid, text, boolean) from public, anon;
revoke all on function public.devolver_venda(uuid, jsonb, text, date, boolean) from public, anon;
grant execute on function public.registrar_venda(uuid, jsonb) to authenticated;
grant execute on function public.marcar_recebimento(uuid, date) to authenticated;
grant execute on function public.cancelar_venda(uuid, text, boolean) to authenticated;
grant execute on function public.devolver_venda(uuid, jsonb, text, date, boolean) to authenticated;

-- Movimentos de estoque lançados direto (ajustes e o recebimento de pedido): só o dono.
-- Antes qualquer membro podia lançar; a equipe passa a só consultar.
drop policy estoque_insercao on public.estoque_movimento;
create policy estoque_insercao on public.estoque_movimento for insert to authenticated
  with check ((select privado.eh_dono(revendedor_id)) and criado_por = (select auth.uid()));
