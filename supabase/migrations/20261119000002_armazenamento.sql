-- Arquivos privados: catálogos (PDF e páginas) e fotos das peças.
-- Caminho sempre começa pelo id do revendedor: <revendedor_id>/<catalogo_id>/...

insert into storage.buckets (id, name, public)
values ('catalogos', 'catalogos', false)
on conflict (id) do nothing;

create policy catalogos_leitura on storage.objects for select to authenticated
  using (bucket_id = 'catalogos' and (select privado.eh_membro(((storage.foldername(name))[1])::uuid)));

create policy catalogos_envio on storage.objects for insert to authenticated
  with check (bucket_id = 'catalogos' and (select privado.eh_dono(((storage.foldername(name))[1])::uuid)));

create policy catalogos_remocao on storage.objects for delete to authenticated
  using (bucket_id = 'catalogos' and (select privado.eh_dono(((storage.foldername(name))[1])::uuid)));
