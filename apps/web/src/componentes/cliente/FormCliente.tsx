"use client";

import { useActionState } from "react";
import { salvarCliente, type Resultado } from "@/app/(app)/clientes/acoes";
import { Aviso, Botao, Campo } from "@/componentes/ui";

export interface ClienteForm {
  id?: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  documento: string | null;
  cidade: string | null;
  aniversario: string | null;
  observacao: string | null;
}

export default function FormCliente({ cliente }: { cliente?: ClienteForm }) {
  const [estado, acao, ocupado] = useActionState<Resultado, FormData>(salvarCliente, {});
  return (
    <form action={acao} className="space-y-3">
      {cliente?.id && <input type="hidden" name="id" value={cliente.id} />}
      <Campo rotulo="Nome" name="nome" required maxLength={120} defaultValue={cliente?.nome ?? ""} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Telefone / WhatsApp" name="telefone" inputMode="tel" maxLength={30} defaultValue={cliente?.telefone ?? ""} />
        <Campo rotulo="E-mail" name="email" type="email" maxLength={120} defaultValue={cliente?.email ?? ""} />
        <Campo rotulo="Cidade" name="cidade" maxLength={80} defaultValue={cliente?.cidade ?? ""} />
        <Campo rotulo="Aniversário" name="aniversario" type="date" defaultValue={cliente?.aniversario ?? ""} />
        <Campo rotulo="CPF (opcional)" name="documento" maxLength={20} defaultValue={cliente?.documento ?? ""} />
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-zinc-800">Observação</span>
        <textarea
          name="observacao"
          rows={2}
          maxLength={1000}
          defaultValue={cliente?.observacao ?? ""}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
        />
      </label>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {estado.ok && <Aviso tipo="ok">Cliente salvo.</Aviso>}
      <Botao type="submit" disabled={ocupado}>
        {ocupado ? "Salvando…" : cliente?.id ? "Salvar" : "Cadastrar cliente"}
      </Botao>
    </form>
  );
}
