"use client";

import { useActionState, useState } from "react";
import { Aviso, Botao, Campo } from "@/componentes/ui";
import { cadastrar, entrar, type EstadoEntrar } from "./acoes";

export default function FormEntrar({ voltar }: { voltar?: string }) {
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [estadoEntrar, acaoEntrar, entrando] = useActionState<EstadoEntrar, FormData>(entrar, {});
  const [estadoCadastro, acaoCadastro, cadastrando] = useActionState<EstadoEntrar, FormData>(cadastrar, {});
  const estado = modo === "entrar" ? estadoEntrar : estadoCadastro;
  const ocupado = entrando || cadastrando;

  return (
    <form action={modo === "entrar" ? acaoEntrar : acaoCadastro} className="space-y-4">
      <div className="grid grid-cols-2 rounded-lg bg-zinc-100 p-1 text-sm">
        {(["entrar", "cadastrar"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className={`rounded-md py-1.5 font-medium ${modo === m ? "bg-white shadow-sm" : "text-zinc-500"}`}
          >
            {m === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        ))}
      </div>
      <input type="hidden" name="voltar" value={voltar ?? ""} />
      <Campo rotulo="E-mail" name="email" type="email" autoComplete="email" required />
      <Campo
        rotulo="Senha"
        name="senha"
        type="password"
        autoComplete={modo === "entrar" ? "current-password" : "new-password"}
        minLength={8}
        required
        dica={modo === "cadastrar" ? "Pelo menos 8 caracteres." : undefined}
      />
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {estado.mensagem && <Aviso tipo="ok">{estado.mensagem}</Aviso>}
      <Botao type="submit" disabled={ocupado} className="w-full">
        {ocupado ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta"}
      </Botao>
    </form>
  );
}
