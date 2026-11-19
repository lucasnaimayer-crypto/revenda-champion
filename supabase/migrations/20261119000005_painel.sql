-- Giro do estoque para o painel: saldo, última venda e última entrada de cada produto.
-- security_invoker: respeita o RLS de estoque_movimento (cada membro só vê o seu revendedor).
create or replace view public.estoque_giro with (security_invoker = true) as
  select
    m.revendedor_id,
    m.produto_id,
    sum(m.quantidade)::integer as saldo,
    max(m.criado_em) filter (where m.tipo = 'venda') as ultima_venda,
    max(m.criado_em) filter (where m.quantidade > 0 and m.tipo in ('entrada', 'ajuste')) as ultima_entrada
  from public.estoque_movimento m
  group by m.revendedor_id, m.produto_id;

grant select on public.estoque_giro to authenticated;
