"use client";

import { useActionState } from "react";
import { Aviso, Botao, Campo } from "@/componentes/ui";
import { criarRevendedor, type EstadoCadastro } from "./acoes";

export default function FormCadastro() {
  const [estado, acao, ocupado] = useActionState<EstadoCadastro, FormData>(criarRevendedor, {});
  return (
    <form action={acao} className="space-y-4">
      <Campo rotulo="Nome da revenda" name="nome" required maxLength={120} placeholder="Ex.: Relógios da Ana" />
      <div className="grid grid-cols-[1fr_5rem] gap-3">
        <Campo rotulo="Cidade" name="cidade" maxLength={80} />
        <Campo rotulo="UF" name="uf" maxLength={2} placeholder="SP" />
      </div>
      <Campo rotulo="Telefone / WhatsApp" name="telefone" maxLength={30} />
      <Campo rotulo="CPF ou CNPJ (opcional)" name="documento" maxLength={20} />
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      <Botao type="submit" disabled={ocupado} className="w-full">
        {ocupado ? "Criando…" : "Continuar"}
      </Botao>
    </form>
  );
}
