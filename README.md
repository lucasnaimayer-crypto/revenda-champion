# Revenda Champion

Sistema de gestão para revendedores Champion: o revendedor sobe o catálogo em PDF que o
representante envia, o sistema separa cada relógio com foto, código e preço, e daí saem o
pedido, o estoque, as vendas e o lucro.

## Estrutura

```
apps/web/            aplicativo Next.js (telas do revendedor)
packages/regras/     cálculo de preço, custos, comissões e lucro (TypeScript puro, com testes)
packages/catalogo/   leitura de catálogos PDF sem IA: código e preço do texto, foto pela posição
supabase/migrations  tabelas, regras de acesso (RLS) e armazenamento
supabase/tests       testes de isolamento entre revendedores (Postgres em memória, PGlite)
```

Dinheiro sempre em centavos (inteiros) e percentuais em pontos-base (10000 = 100%).

## Rodar

Requer Node 22 e pnpm 10.

```bash
pnpm install
pnpm test        # regras, leitor de catálogo e isolamento do banco
pnpm typecheck
pnpm lint
```

Para o aplicativo:

1. Crie um projeto no Supabase e aplique as migrações: `npx supabase link --project-ref <ref>` e `npx supabase db push`.
2. Em Authentication → URL Configuration, adicione `http://localhost:3000/auth/confirmar` às URLs de redirecionamento.
3. Copie `apps/web/.env.example` para `apps/web/.env.local` e preencha URL e chave publicável do projeto.
4. `pnpm dev` e abra http://localhost:3000.

## Testar com catálogos reais

Os catálogos não ficam no repositório. Para conferir o leitor com PDFs reais:

```bash
CATALOGOS_DIR=/pasta/com/os/pdfs pnpm --filter @revenda/catalogo test
pnpm --filter @revenda/catalogo ler /pasta/catalogo.pdf
```

## Publicar na Vercel

1. Em vercel.com, **Add New → Project** e importe o repositório `revenda-champion`.
2. Em **Root Directory**, escolha `apps/web`. A Vercel detecta Next.js e pnpm sozinha.
3. Em **Environment Variables**, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase → Project Settings → API).
   - Opcional, para ler fotos e prints com IA: `ANTHROPIC_API_KEY` (console.anthropic.com) e
     `ANTHROPIC_MODEL` (o modelo da Claude a usar). Sem a chave, o app funciona normalmente e só
     aceita catálogos em PDF. `IA_LIMITE_DIARIO` limita as leituras de cada revendedor a cada
     24 horas (padrão 100), porque o custo fica na conta da chave.
4. **Deploy**. Ao terminar, anote o endereço (por exemplo `https://revenda-champion.vercel.app`).
5. No Supabase, em Authentication → URL Configuration:
   - **Site URL**: o endereço da Vercel.
   - **Redirect URLs**: `https://<endereço>/auth/confirmar` e, para as prévias de cada PR,
     `https://*-<sua-conta>.vercel.app/auth/confirmar`.

Cada push na `main` publica de novo; cada PR ganha um endereço de prévia.

No celular, abra o endereço no navegador e use "Adicionar à tela de início": o app abre em tela
cheia, direto no painel.
