-- Convite da equipe: o dono gera um link para um e-mail; quem entra com esse e-mail aceita e
-- vira membro "equipe" do revendedor (vê estoque e clientes, sem custos, regras ou vendas).

alter table public.membro add column if not exists email text check (email is null or length(email) <= 120);

create table public.convite (
  id uuid primary key default gen_random_uuid(),
  revendedor_id uuid not null references public.revendedor (id) on delete cascade,
  email text not null check (length(email) <= 120 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  papel text not null default 'equipe' check (papel = 'equipe'),
  -- 64 caracteres hexadecimais aleatórios (dois UUID v4 sem hífens).
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  aceito_em timestamptz,
  aceito_por uuid references auth.users (id) on delete set null,
  cancelado_em timestamptz
);
create index convite_revendedor_idx on public.convite (revendedor_id, criado_em desc);

alter table public.convite enable row level security;

create policy convite_dono on public.convite for select to authenticated
  using ((select privado.eh_dono(revendedor_id)));
create policy convite_criacao on public.convite for insert to authenticated
  with check ((select privado.eh_dono(revendedor_id)) and criado_por = (select auth.uid()) and aceito_em is null and cancelado_em is null);
create policy convite_cancelamento on public.convite for update to authenticated
  using ((select privado.eh_dono(revendedor_id))) with check ((select privado.eh_dono(revendedor_id)));

-- O dono só cancela convites; o resto do convite não muda.
revoke update on public.convite from authenticated;
grant update (cancelado_em) on public.convite to authenticated;

-- Mostra para quem abriu o link de qual revenda é o convite, antes de aceitar.
create or replace function public.ver_convite(p_token text)
returns table (revendedor text, email text, situacao text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.nome, c.email,
         case
           when c.aceito_em is not null then 'aceito'
           when c.cancelado_em is not null then 'cancelado'
           when c.expira_em < now() then 'expirado'
           else 'valido'
         end
    from public.convite c
    join public.revendedor r on r.id = c.revendedor_id
   where c.token = p_token and (select auth.uid()) is not null;
$$;

-- Aceita o convite com a conta logada. O e-mail da conta precisa ser o do convite.
create or replace function public.aceitar_convite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_email text;
  v_convite record;
  v_organizacao uuid;
begin
  if v_usuario is null then
    raise exception 'entre na sua conta para aceitar o convite' using errcode = '28000';
  end if;
  select c.* into v_convite from public.convite c where c.token = p_token for update;
  if v_convite.id is null or v_convite.cancelado_em is not null then
    raise exception 'convite não encontrado ou cancelado' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.membro m where m.usuario_id = v_usuario and m.revendedor_id = v_convite.revendedor_id) then
    return v_convite.revendedor_id;
  end if;
  if v_convite.aceito_em is not null then
    raise exception 'este convite já foi usado';
  end if;
  if v_convite.expira_em < now() then
    raise exception 'este convite expirou; peça um novo';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_usuario;
  if v_email is distinct from lower(v_convite.email) then
    raise exception 'este convite é para %; entre com esse e-mail', v_convite.email;
  end if;
  if exists (select 1 from public.membro m where m.usuario_id = v_usuario and m.revendedor_id is not null) then
    raise exception 'esta conta já faz parte de outra revenda';
  end if;

  select r.organizacao_id into v_organizacao from public.revendedor r where r.id = v_convite.revendedor_id;
  insert into public.membro (usuario_id, organizacao_id, revendedor_id, papel, email)
  values (v_usuario, v_organizacao, v_convite.revendedor_id, 'equipe', v_email);
  update public.convite set aceito_em = now(), aceito_por = v_usuario where id = v_convite.id;
  insert into public.auditoria (revendedor_id, usuario_id, acao, tabela, registro_id, depois)
  values (v_convite.revendedor_id, v_usuario, 'aceitar', 'convite', v_convite.id::text, jsonb_build_object('email', v_email));
  return v_convite.revendedor_id;
end;
$$;

revoke all on function public.ver_convite(text) from public, anon;
revoke all on function public.aceitar_convite(text) from public, anon;
grant execute on function public.ver_convite(text) to authenticated;
grant execute on function public.aceitar_convite(text) to authenticated;
