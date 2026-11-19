# Instruções para agentes

- Idioma do código, da interface e dos commits: português.
- Dinheiro em centavos (inteiros) e percentuais em pontos-base. Nunca use float para valores.
- Toda tabela de dados do revendedor tem `revendedor_id` e RLS. Mudou o banco? Crie uma nova migração em
  `supabase/migrations` e cubra o acesso em `supabase/tests`.
- Regras de cálculo ficam em `packages/regras`, com testes; a interface só chama essas funções.
- O Next.js deste projeto é a versão 16: leia `apps/web/node_modules/next/dist/docs/` antes de usar APIs novas.
- Antes de abrir PR: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
