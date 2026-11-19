// Banco Postgres em memória (PGlite) com o mínimo do Supabase que as migrações usam:
// papéis anon/authenticated, auth.users, auth.uid() e o schema storage.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PREPARO = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null, owner uuid);
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant execute on function storage.foldername(text) to authenticated;
`;

export interface Banco {
  db: PGlite;
  /** Executa como um usuário logado (papel authenticated). */
  como<T = Record<string, unknown>>(usuario: string | null, sql: string, params?: unknown[]): Promise<T[]>;
  /** Executa como superusuário, ignorando RLS. */
  admin<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  criarUsuario(id: string, email?: string): Promise<void>;
}

export async function criarBanco(): Promise<Banco> {
  const db = new PGlite();
  await db.exec("create extension if not exists pgcrypto;").catch(() => undefined);
  await db.exec(PREPARO);
  const pasta = join(import.meta.dirname, "..", "migrations");
  for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(pasta, arquivo), "utf8").replace(/create extension if not exists pgcrypto;/g, "");
    await db.exec(sql);
  }

  async function como<T>(usuario: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [usuario ?? ""]);
      await tx.exec(`set local role ${usuario ? "authenticated" : "anon"}`);
      const r = await tx.query<T>(sql, params);
      return r.rows;
    });
  }

  async function admin<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await db.query<T>(sql, params)).rows;
  }

  async function criarUsuario(id: string, email = `${id.slice(0, 8)}@teste.dev`) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  }

  return { db, como, admin, criarUsuario };
}
