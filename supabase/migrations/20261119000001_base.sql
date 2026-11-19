-- Base do sistema: organização (Champion), revendedores, membros, regras de preço,
-- catálogos, produtos, pedidos e estoque. Dinheiro em centavos (integer/bigint) e
-- percentuais em pontos-base (10000 = 100%).
--
-- Isolamento: toda tabela de dados de um revendedor tem revendedor_id e Row Level Security.
-- Um usuário só lê e altera dados dos revendedores dos quais é membro. Membros e
-- revendedores só são criados pelas funções deste arquivo, nunca por insert direto.

create extension if not exists pgcrypto;

create schema if not exists privado;

-- ---------------------------------------------------------------------------
-- Organização, representantes, revendedores e membros
-- ---------------------------------------------------------------------------

create table public.organizacao (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  nome text not null check (length(nome) between 1 and 120),
  criado_em timestamptz not null default now()
);

create table public.representante (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacao (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 120),
  regiao text,
  telefone text,
  email text,
  criado_em timestamptz not null default now()
);
create index representante_organizacao_idx on public.representante (organizacao_id);

create table public.revendedor (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacao (id) on delete restrict,
  representante_id uuid references public.representante (id) on delete set null,
  nome text not null check (length(nome) between 1 and 120),
  documento text check (documento is null or length(documento) <= 20),
  cidade text check (cidade is null or length(cidade) <= 80),
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  telefone text check (telefone is null or length(telefone) <= 30),
  status text not null default 'ativo' check (status in ('ativo', 'suspenso')),
  -- false até o revendedor concluir o primeiro acesso (regras de preço e custos).
  configurado boolean not null default false,
  criado_em timestamptz not null default now()
);
create index revendedor_organizacao_idx on public.revendedor (organizacao_id);
create index revendedor_representante_idx on public.revendedor (representante_id);

create table public.membro (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  organizacao_id uuid not null references public.organizacao (id) on delete cascade,
  revendedor_id uuid references public.revendedor (id) on delete cascade,
  papel text not null check (papel in ('dono', 'equipe', 'representante', 'champion_admin')),
  criado_em timestamptz not null default now(),
  -- dono e equipe pertencem a um revendedor; representante e champion_admin à organização.
  check ((papel in ('dono', 'equipe')) = (revendedor_id is not null)),
  unique nulls not distinct (usuario_id, organizacao_id, revendedor_id)
);
create index membro_usuario_idx on public.membro (usuario_id);
create index membro_revendedor_idx on public.membro (revendedor_id);
create index membro_organizacao_idx on public.membro (organizacao_id);

-- ---------------------------------------------------------------------------
-- Funções de acesso usadas pelas políticas. Ficam no schema privado (não exposto pela API)
-- e sempre conferem o usuário da sessão.
-- ---------------------------------------------------------------------------

create or replace function privado.eh_membro(p_revendedor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membro m
    where m.revendedor_id = p_revendedor
      and m.usuario_id = (select auth.uid())
  );
$$;

create or replace function privado.eh_dono(p_revendedor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membro m
    where m.revendedor_id = p_revendedor
      and m.usuario_id = (select auth.uid())
      and m.papel = 'dono'
  );
$$;

create or replace function privado.eh_admin_da_organizacao(p_organizacao uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membro m
    where m.organizacao_id = p_organizacao
      and m.revendedor_id is null
      and m.usuario_id = (select auth.uid())
      and m.papel = 'champion_admin'
  );
$$;

revoke all on schema privado from public;
grant usage on schema privado to authenticated;
revoke all on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to authenticated;

alter table public.organizacao enable row level security;
alter table public.representante enable row level security;
alter table public.revendedor enable row level security;
alter table public.membro enable row level security;

create policy organizacao_leitura on public.organizacao for select to authenticated
  using (exists (select 1 from public.membro m where m.organizacao_id = organizacao.id and m.usuario_id = (select auth.uid())));

create policy representante_leitura on public.representante for select to authenticated
  using (exists (select 1 from public.membro m where m.organizacao_id = representante.organizacao_id and m.usuario_id = (select auth.uid())));

create policy revendedor_leitura on public.revendedor for select to authenticated
  using ((select privado.eh_membro(id)) or (select privado.eh_admin_da_organizacao(organizacao_id)));
create policy revendedor_edicao on public.revendedor for update to authenticated
  using ((select privado.eh_dono(id)))
  with check ((select privado.eh_dono(id)));

create policy membro_leitura on public.membro for select to authenticated
  using (usuario_id = (select auth.uid()) or (revendedor_id is not null and (select privado.eh_dono(revendedor_id))));
create policy membro_remocao on public.membro for delete to authenticated
  using (papel = 'equipe' and (select privado.eh_dono(revendedor_id)));

-- O dono só muda dados cadastrais; organização, representante, status e id ficam travados.
revoke update on public.revendedor from authenticated;
grant update (nome, documento, cidade, uf, telefone, configurado) on public.revendedor to authenticated;

-- ---------------------------------------------------------------------------
-- Regras de preço, custos do revendedor e comissões
-- ---------------------------------------------------------------------------

create table public.regra_preco (
  revendedor_id uuid primary key references public.revendedor (id) on delete cascade,
  frete_bp integer not null default 0 check (frete_bp between 0 and 100000),
  markup_bp integer not null default 10000 check (markup_bp between 0 and 100000),
  arredondamento text not null default 'nenhum' check (arredondamento in ('nenhum', 'inteiro', 'final_90')),
  atualizado_em timestamptz not null default now()
);

create table public.custo_tipo (
  id uuid primary key default gen_random_uuid(),
  revendedor_id uuid not null references public.revendedor (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 60),
  modo text not null check (modo in ('fixo', 'percentual')),
  -- fixo: centavos por peça; percentual: pontos-base sobre o custo da peça.
  valor integer not null check (valor >= 0),
  aplica_a_todos boolean not null default true,
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  unique (revendedor_id, nome)
);
create index custo_tipo_revendedor_idx on public.custo_tipo (revendedor_id);

create table public.regra_comissao (
  id uuid primary key default gen_random_uuid(),
  revendedor_id uuid not null references public.revendedor (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 60),
  percentual_bp integer not null check (percentual_bp between 0 and 10000),
  ligada_por_padrao boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (revendedor_id, nome)
);
create index regra_comissao_revendedor_idx on public.regra_comissao (revendedor_id);

-- ---------------------------------------------------------------------------
-- Catálogos lidos e produtos do revendedor
-- ---------------------------------------------------------------------------

create table public.catalogo (
  id uuid primary key default gen_random_uuid(),
  revendedor_id uuid not null references public.revendedor (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 120),
  origem text not null check (origem in ('pdf', 'imagem', 'champion')),
  status text not null default 'processando' check (status in ('processando', 'pronto', 'erro')),
  arquivo_path text,
  total_paginas integer not null default 0 check (total_paginas >= 0),
  total_pecas integer not null default 0 check (total_pecas >= 0),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);
create index catalogo_revendedor_idx on public.catalogo (revendedor_id, criado_em desc);

create table public.catalogo_peca (
  id uuid primary key default gen_random_uuid(),
  catalogo_id uuid not null references public.catalogo (id) on delete cascade,
  revendedor_id uuid not null references public.revendedor (id) on delete cascade,
  pagina integer not null check (pagina >= 1),
  posicao integer not null check (posicao >= 1),
  codigo text not null check (length(codigo) between 1 and 40),
  descricao text check (descricao is null or length(descricao) <= 200),
  custo integer not null check (custo >= 0),
  imagem_path text,
  origem_leitura text not null default 'pdf' check (origem_leitura in ('pdf', 'ia', 'manual')),
  -- 0 a 1; leitura do PDF é 1. Abaixo do limite a peça vai para revisão.
  certeza numeric(3, 2) not null default 1 check (certeza between 0 and 1),
  revisada boolean not null default false,
  unique (catalogo_id, pagina, posicao)
);
create index catalogo_peca_catalogo_idx on public.catalogo_peca (catalogo_id);
create index catalogo_peca_revendedor_codigo_idx on public.catalogo_peca (revendedor_id, codigo);

create table public.produto (
  id uuid primary key default gen_random_uuid(),
  revendedor_id uuid not null references public.revendedor (id) on delete cascade,
  codigo text not null check (length(codigo) between 1 and 40),
  descricao text check (descricao is null or length(descricao) <= 200),
  imagem_path text,
  custo integer not null default 0 check (custo >= 0),
  -- null: preço vem da regra; número: preço definido à mão.
  preco_manual integer check (preco_manual is null or preco_manual >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (revendedor_id, codigo)
);

create table public.produto_custo (
  produto_id uuid not null references public.produto (id) on delete cascade,
  custo_tipo_id uuid not null references public.custo_tipo (id) on delete cascade,
  revendedor_id uuid not null references public.revendedor (id) on delete cascade,
  -- null: este custo não entra neste produto; número: valor só para este produto.
  valor integer check (valor is null or valor >= 0),
  primary key (produto_id, custo_tipo_id)
);
create index produto_custo_tipo_idx on public.produto_custo (custo_tipo_id);
create index produto_custo_revendedor_idx on public.produto_custo (revendedor_id);

-- ---------------------------------------------------------------------------
-- Pedidos e estoque
-- ---------------------------------------------------------------------------

create table public.pedido (
  id uuid primary key default gen_random_uuid(),
  revendedor_id uuid not null references public.revendedor (id) on delete cascade,
  catalogo_id uuid references public.catalogo (id) on delete set null,
  representante_id uuid references public.representante (id) on delete set null,
  numero integer not null,
  nome text not null check (length(nome) between 1 and 120),
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'confirmado', 'recebido', 'cancelado')),
  enviado_em timestamptz,
  confirmado_em timestamptz,
  recebido_em timestamptz,
  observacao text check (observacao is null or length(observacao) <= 1000),
  criado_em timestamptz not null default now(),
  unique (revendedor_id, numero)
);
create index pedido_revendedor_idx on public.pedido (revendedor_id, criado_em desc);
create index pedido_catalogo_idx on public.pedido (catalogo_id);
create index pedido_representante_idx on public.pedido (representante_id);

create table public.pedido_item (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedido (id) on delete cascade,
  revendedor_id uuid not null references public.revendedor (id) on delete cascade,
  catalogo_peca_id uuid references public.catalogo_peca (id) on delete set null,
  produto_id uuid references public.produto (id) on delete set null,
  codigo text not null check (length(codigo) between 1 and 40),
  descricao text,
  imagem_path text,
  quantidade integer not null check (quantidade between 1 and 10000),
  quantidade_recebida integer check (quantidade_recebida is null or quantidade_recebida >= 0),
  -- Cópia dos valores no momento do pedido: o histórico não muda quando a regra muda.
  custo integer not null check (custo >= 0),
  custo_total integer not null check (custo_total >= 0),
  preco_venda integer not null check (preco_venda >= 0),
  lucro integer not null,
  detalhe jsonb not null default '{}'::jsonb,
  unique (pedido_id, codigo)
);
create index pedido_item_pedido_idx on public.pedido_item (pedido_id);
create index pedido_item_revendedor_idx on public.pedido_item (revendedor_id);
create index pedido_item_catalogo_peca_idx on public.pedido_item (catalogo_peca_id);
create index pedido_item_produto_idx on public.pedido_item (produto_id);

create table public.estoque_movimento (
  id uuid primary key default gen_random_uuid(),
  revendedor_id uuid not null references public.revendedor (id) on delete cascade,
  produto_id uuid not null references public.produto (id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'venda', 'devolucao', 'ajuste')),
  -- positivo entra, negativo sai.
  quantidade integer not null check (quantidade <> 0),
  custo_unitario integer check (custo_unitario is null or custo_unitario >= 0),
  origem_tipo text check (origem_tipo in ('pedido', 'venda', 'manual')),
  origem_id uuid,
  motivo text check (motivo is null or length(motivo) <= 200),
  chave_idempotencia text not null,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (revendedor_id, chave_idempotencia)
);
create index estoque_movimento_produto_idx on public.estoque_movimento (produto_id);

create view public.estoque_saldo with (security_invoker = true) as
  select m.revendedor_id, m.produto_id, sum(m.quantidade)::integer as saldo
  from public.estoque_movimento m
  group by m.revendedor_id, m.produto_id;

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------

create table public.auditoria (
  id bigint generated always as identity primary key,
  revendedor_id uuid references public.revendedor (id) on delete cascade,
  usuario_id uuid,
  acao text not null,
  tabela text not null,
  registro_id text,
  antes jsonb,
  depois jsonb,
  criado_em timestamptz not null default now()
);
create index auditoria_revendedor_idx on public.auditoria (revendedor_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- RLS das tabelas do revendedor
-- Leitura para qualquer membro; escrita só do dono, exceto onde a equipe trabalha.
-- ---------------------------------------------------------------------------

alter table public.regra_preco enable row level security;
alter table public.custo_tipo enable row level security;
alter table public.regra_comissao enable row level security;
alter table public.catalogo enable row level security;
alter table public.catalogo_peca enable row level security;
alter table public.produto enable row level security;
alter table public.produto_custo enable row level security;
alter table public.pedido enable row level security;
alter table public.pedido_item enable row level security;
alter table public.estoque_movimento enable row level security;
alter table public.auditoria enable row level security;

-- Regras de preço, custos e comissões: só o dono vê e muda.
create policy regra_preco_dono on public.regra_preco for all to authenticated
  using ((select privado.eh_dono(revendedor_id))) with check ((select privado.eh_dono(revendedor_id)));
create policy custo_tipo_dono on public.custo_tipo for all to authenticated
  using ((select privado.eh_dono(revendedor_id))) with check ((select privado.eh_dono(revendedor_id)));
create policy regra_comissao_dono on public.regra_comissao for all to authenticated
  using ((select privado.eh_dono(revendedor_id))) with check ((select privado.eh_dono(revendedor_id)));
create policy produto_custo_dono on public.produto_custo for all to authenticated
  using ((select privado.eh_dono(revendedor_id))) with check ((select privado.eh_dono(revendedor_id)));

-- Catálogos e pedidos (têm custo): só o dono.
create policy catalogo_dono on public.catalogo for all to authenticated
  using ((select privado.eh_dono(revendedor_id))) with check ((select privado.eh_dono(revendedor_id)));
create policy catalogo_peca_dono on public.catalogo_peca for all to authenticated
  using ((select privado.eh_dono(revendedor_id))) with check ((select privado.eh_dono(revendedor_id)));
create policy pedido_dono on public.pedido for all to authenticated
  using ((select privado.eh_dono(revendedor_id))) with check ((select privado.eh_dono(revendedor_id)));
create policy pedido_item_dono on public.pedido_item for all to authenticated
  using ((select privado.eh_dono(revendedor_id))) with check ((select privado.eh_dono(revendedor_id)));

-- Produtos e estoque: a equipe lê; o dono muda. Movimentos são imutáveis (sem update/delete).
create policy produto_leitura on public.produto for select to authenticated
  using ((select privado.eh_membro(revendedor_id)));
create policy produto_escrita on public.produto for insert to authenticated
  with check ((select privado.eh_dono(revendedor_id)));
create policy produto_edicao on public.produto for update to authenticated
  using ((select privado.eh_dono(revendedor_id))) with check ((select privado.eh_dono(revendedor_id)));
create policy produto_remocao on public.produto for delete to authenticated
  using ((select privado.eh_dono(revendedor_id)));

create policy estoque_leitura on public.estoque_movimento for select to authenticated
  using ((select privado.eh_membro(revendedor_id)));
create policy estoque_insercao on public.estoque_movimento for insert to authenticated
  with check ((select privado.eh_membro(revendedor_id)) and criado_por = (select auth.uid()));

-- Auditoria: o dono lê; a escrita é feita pelas funções do servidor.
create policy auditoria_leitura on public.auditoria for select to authenticated
  using (revendedor_id is not null and (select privado.eh_dono(revendedor_id)));

-- Uma peça de catálogo, produto ou item precisa pertencer ao mesmo revendedor do pai.
create or replace function privado.conferir_mesmo_revendedor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pai uuid;
begin
  if tg_table_name = 'catalogo_peca' then
    select c.revendedor_id into pai from public.catalogo c where c.id = new.catalogo_id;
  elsif tg_table_name = 'pedido_item' then
    select p.revendedor_id into pai from public.pedido p where p.id = new.pedido_id;
  elsif tg_table_name = 'produto_custo' then
    select p.revendedor_id into pai from public.produto p where p.id = new.produto_id;
    if not exists (select 1 from public.custo_tipo t where t.id = new.custo_tipo_id and t.revendedor_id = new.revendedor_id) then
      raise exception 'custo de outro revendedor';
    end if;
  end if;
  if pai is distinct from new.revendedor_id then
    raise exception 'registro de outro revendedor';
  end if;
  return new;
end;
$$;

create trigger catalogo_peca_mesmo_revendedor before insert or update on public.catalogo_peca
  for each row execute function privado.conferir_mesmo_revendedor();
create trigger pedido_item_mesmo_revendedor before insert or update on public.pedido_item
  for each row execute function privado.conferir_mesmo_revendedor();
create trigger produto_custo_mesmo_revendedor before insert or update on public.produto_custo
  for each row execute function privado.conferir_mesmo_revendedor();

-- ---------------------------------------------------------------------------
-- Funções chamadas pelo aplicativo
-- ---------------------------------------------------------------------------

-- Cria o revendedor do usuário logado na organização indicada e o torna dono.
-- Sem regras herdadas: começa com frete 0, markup 100% e nenhum custo extra.
create or replace function public.criar_revendedor(
  p_nome text,
  p_documento text default null,
  p_cidade text default null,
  p_uf text default null,
  p_telefone text default null,
  p_organizacao_slug text default 'champion'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_organizacao uuid;
  v_revendedor uuid;
begin
  if v_usuario is null then
    raise exception 'sessão inválida' using errcode = '28000';
  end if;
  if exists (select 1 from public.membro m where m.usuario_id = v_usuario and m.papel = 'dono') then
    raise exception 'usuário já tem um revendedor' using errcode = '23505';
  end if;
  select o.id into v_organizacao from public.organizacao o where o.slug = p_organizacao_slug;
  if v_organizacao is null then
    raise exception 'organização não encontrada' using errcode = 'P0002';
  end if;

  insert into public.revendedor (organizacao_id, nome, documento, cidade, uf, telefone)
  values (v_organizacao, trim(p_nome), nullif(trim(p_documento), ''), nullif(trim(p_cidade), ''), nullif(upper(trim(p_uf)), ''), nullif(trim(p_telefone), ''))
  returning id into v_revendedor;

  insert into public.membro (usuario_id, organizacao_id, revendedor_id, papel)
  values (v_usuario, v_organizacao, v_revendedor, 'dono');

  insert into public.regra_preco (revendedor_id) values (v_revendedor);

  insert into public.auditoria (revendedor_id, usuario_id, acao, tabela, registro_id)
  values (v_revendedor, v_usuario, 'criar', 'revendedor', v_revendedor::text);

  return v_revendedor;
end;
$$;

revoke all on function public.criar_revendedor(text, text, text, text, text, text) from public, anon;
grant execute on function public.criar_revendedor(text, text, text, text, text, text) to authenticated;

-- Organização inicial.
insert into public.organizacao (slug, nome) values ('champion', 'Champion');
