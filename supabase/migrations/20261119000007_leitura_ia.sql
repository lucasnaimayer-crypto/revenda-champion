-- Leitura de fotos e prints de catálogo por IA (plano B, quando não há PDF com texto).
-- Cada leitura custa dinheiro na conta de quem publica o sistema, então há um limite diário por
-- revendedor. O servidor registra a leitura aqui antes de chamar a IA; o registro fica na auditoria.

create or replace function public.registrar_leitura_ia(p_revendedor uuid, p_limite integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usadas integer;
begin
  if p_revendedor is null or not (select privado.eh_dono(p_revendedor)) then
    raise exception 'só o dono pode ler catálogos' using errcode = '42501';
  end if;
  if p_limite is null or p_limite < 1 then
    raise exception 'limite inválido';
  end if;
  -- Duas leituras ao mesmo tempo não passam juntas do limite.
  perform pg_advisory_xact_lock(hashtext('leitura_ia:' || p_revendedor::text));
  select count(*) into v_usadas
    from public.auditoria a
   where a.revendedor_id = p_revendedor
     and a.acao = 'leitura_ia'
     and a.criado_em > now() - interval '24 hours';
  if v_usadas >= p_limite then
    raise exception 'limite de % leituras por IA em 24 horas atingido; tente de novo mais tarde', p_limite;
  end if;
  insert into public.auditoria (revendedor_id, usuario_id, acao, tabela)
  values (p_revendedor, (select auth.uid()), 'leitura_ia', 'catalogo');
  return p_limite - v_usadas - 1;
end;
$$;

revoke all on function public.registrar_leitura_ia(uuid, integer) from public, anon;
grant execute on function public.registrar_leitura_ia(uuid, integer) to authenticated;
