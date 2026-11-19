-- Pedidos: numeração por revendedor, travas por situação e recebimento com entrada no estoque.

-- Número sequencial do pedido dentro de cada revendedor (1, 2, 3...).
create or replace function privado.numerar_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Trava por revendedor para dois pedidos simultâneos não pegarem o mesmo número.
  perform pg_advisory_xact_lock(hashtext('pedido:' || new.revendedor_id::text));
  select coalesce(max(p.numero), 0) + 1 into new.numero from public.pedido p where p.revendedor_id = new.revendedor_id;
  return new;
end;
$$;

create trigger pedido_numero before insert on public.pedido
  for each row execute function privado.numerar_pedido();

-- Situação só muda pelas funções abaixo; a numeração e o vínculo com o revendedor não mudam.
create or replace function privado.proteger_pedido()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.revendedor_id <> old.revendedor_id or new.numero <> old.numero then
    raise exception 'pedido não pode mudar de revendedor ou número';
  end if;
  if new.status <> old.status and current_setting('revenda.mudando_status', true) is distinct from 'sim' then
    raise exception 'use mudar_status_pedido ou receber_pedido para mudar a situação';
  end if;
  return new;
end;
$$;

create trigger pedido_protegido before update on public.pedido
  for each row execute function privado.proteger_pedido();

-- Itens só entram, saem ou mudam de quantidade e preço enquanto o pedido é rascunho.
create or replace function privado.travar_itens_do_pedido()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select p.status into v_status from public.pedido p where p.id = coalesce(new.pedido_id, old.pedido_id);
  if v_status = 'rascunho' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE'
     and current_setting('revenda.recebendo', true) = 'sim'
     and (new.quantidade, new.custo, new.custo_total, new.preco_venda, new.lucro, new.codigo)
         is not distinct from (old.quantidade, old.custo, old.custo_total, old.preco_venda, old.lucro, old.codigo) then
    return new;
  end if;
  raise exception 'pedido % não está mais em rascunho', coalesce(v_status, '?');
end;
$$;

create trigger pedido_item_travado before insert or update or delete on public.pedido_item
  for each row execute function privado.travar_itens_do_pedido();

-- Muda a situação seguindo o fluxo: rascunho → enviado → confirmado; cancelar antes de receber.
-- Roda com as permissões de quem chama (RLS vale): só o dono do revendedor consegue.
create or replace function public.mudar_status_pedido(p_pedido uuid, p_status text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_atual text;
  v_itens integer;
begin
  select p.status into v_atual from public.pedido p where p.id = p_pedido for update;
  if v_atual is null then
    raise exception 'pedido não encontrado' using errcode = 'P0002';
  end if;
  if not (
    (v_atual = 'rascunho' and p_status = 'enviado')
    or (v_atual = 'enviado' and p_status in ('confirmado', 'rascunho'))
    or (v_atual in ('rascunho', 'enviado', 'confirmado') and p_status = 'cancelado')
  ) then
    raise exception 'não dá para passar de % para %', v_atual, p_status;
  end if;
  if p_status = 'enviado' then
    select count(*) into v_itens from public.pedido_item i where i.pedido_id = p_pedido;
    if v_itens = 0 then
      raise exception 'o pedido não tem peças';
    end if;
  end if;
  perform set_config('revenda.mudando_status', 'sim', true);
  update public.pedido
     set status = p_status,
         enviado_em = case when p_status = 'enviado' then now() when p_status = 'rascunho' then null else enviado_em end,
         confirmado_em = case when p_status = 'confirmado' then now() else confirmado_em end
   where id = p_pedido;
  perform set_config('revenda.mudando_status', '', true);
end;
$$;

-- Recebe o pedido: grava o que chegou, cria ou atualiza os produtos pelo código e lança a
-- entrada no estoque. Idempotente: a chave de cada movimento é pedido + item.
-- p_recebidos: [{"item_id": "...", "quantidade": 3}]; itens ausentes contam como recebidos por inteiro.
create or replace function public.receber_pedido(p_pedido uuid, p_recebidos jsonb default '[]'::jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pedido record;
  v_item record;
  v_qtd integer;
  v_produto uuid;
  v_usuario uuid := (select auth.uid());
  v_pecas integer := 0;
begin
  select p.id, p.revendedor_id, p.status, p.numero into v_pedido from public.pedido p where p.id = p_pedido for update;
  if v_pedido.id is null then
    raise exception 'pedido não encontrado' using errcode = 'P0002';
  end if;
  if v_pedido.status not in ('enviado', 'confirmado') then
    raise exception 'só pedidos enviados ou confirmados podem ser recebidos (situação: %)', v_pedido.status;
  end if;

  perform set_config('revenda.recebendo', 'sim', true);
  for v_item in select * from public.pedido_item i where i.pedido_id = p_pedido order by i.codigo loop
    select coalesce(max((r ->> 'quantidade')::integer), v_item.quantidade) into v_qtd
      from jsonb_array_elements(coalesce(p_recebidos, '[]'::jsonb)) r
     where (r ->> 'item_id')::uuid = v_item.id;
    v_qtd := coalesce(v_qtd, v_item.quantidade);
    if v_qtd < 0 then
      raise exception 'quantidade recebida negativa para %', v_item.codigo;
    end if;

    insert into public.produto (revendedor_id, codigo, descricao, imagem_path, custo)
    values (v_pedido.revendedor_id, v_item.codigo, v_item.descricao, v_item.imagem_path, v_item.custo)
    on conflict (revendedor_id, codigo) do update
      set custo = excluded.custo,
          imagem_path = coalesce(public.produto.imagem_path, excluded.imagem_path),
          descricao = coalesce(public.produto.descricao, excluded.descricao),
          ativo = true
    returning id into v_produto;

    if v_qtd > 0 then
      insert into public.estoque_movimento
        (revendedor_id, produto_id, tipo, quantidade, custo_unitario, origem_tipo, origem_id, motivo, chave_idempotencia, criado_por)
      values
        (v_pedido.revendedor_id, v_produto, 'entrada', v_qtd, v_item.custo, 'pedido', p_pedido,
         'Pedido nº ' || v_pedido.numero, 'pedido:' || p_pedido || ':item:' || v_item.id, v_usuario)
      on conflict (revendedor_id, chave_idempotencia) do nothing;
      v_pecas := v_pecas + v_qtd;
    end if;

    update public.pedido_item set quantidade_recebida = v_qtd, produto_id = v_produto where id = v_item.id;
  end loop;
  perform set_config('revenda.recebendo', '', true);

  perform set_config('revenda.mudando_status', 'sim', true);
  update public.pedido set status = 'recebido', recebido_em = now() where id = p_pedido;
  perform set_config('revenda.mudando_status', '', true);

  insert into public.auditoria (revendedor_id, usuario_id, acao, tabela, registro_id, depois)
  values (v_pedido.revendedor_id, v_usuario, 'receber', 'pedido', p_pedido::text, jsonb_build_object('pecas', v_pecas));
  return v_pecas;
end;
$$;

revoke all on function public.mudar_status_pedido(uuid, text) from public, anon;
grant execute on function public.mudar_status_pedido(uuid, text) to authenticated;
revoke all on function public.receber_pedido(uuid, jsonb) from public, anon;
grant execute on function public.receber_pedido(uuid, jsonb) to authenticated;

-- A auditoria é gravada por receber_pedido com as permissões do dono.
create policy auditoria_insercao on public.auditoria for insert to authenticated
  with check (revendedor_id is not null and (select privado.eh_dono(revendedor_id)) and usuario_id = (select auth.uid()));
