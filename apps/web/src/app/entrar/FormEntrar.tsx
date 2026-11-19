"use client";

import { useActionState, useState } from "react";
import { Aviso, Botao, Campo, classeCampo } from "@/componentes/ui";
import { acessar, type EstadoEntrar } from "./acoes";

export default function FormEntrar({ voltar }: { voltar?: string }) {
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [estado, acao, ocupado] = useActionState<EstadoEntrar, FormData>(acessar, {});
  const [trocouEmail, setTrocouEmail] = useState<string | null>(null);

  if (estado.etapa === "codigo" && estado.email && trocouEmail !== estado.email) {
    return (
      <form action={acao} className="space-y-4">
        <input type="hidden" name="voltar" value={voltar ?? ""} />
        <input type="hidden" name="email" value={estado.email} />
        <div>
          <p className="font-medium">Confirme o seu e-mail</p>
          <p className="mt-1 text-sm text-zinc-500">
            Digite o código que chegou em <span className="font-medium text-zinc-800">{estado.email}</span>. Confira também a caixa de spam.
          </p>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-zinc-800">Código</span>
          <input
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={12}
            placeholder="000000"
            className={`${classeCampo} text-center font-mono text-2xl tracking-[0.4em]`}
            required
          />
        </label>
        {estado.erro && <Aviso>{estado.erro}</Aviso>}
        {estado.mensagem && !estado.erro && <Aviso tipo="ok">{estado.mensagem}</Aviso>}
        <Botao type="submit" name="intencao" value="codigo" disabled={ocupado} className="w-full">
          {ocupado ? "Aguarde…" : "Confirmar e continuar"}
        </Botao>
        <div className="flex justify-between text-sm">
          <button type="submit" name="intencao" value="reenviar" formNoValidate disabled={ocupado} className="text-marca hover:underline disabled:opacity-50">
            Reenviar código
          </button>
          <button type="button" onClick={() => setTrocouEmail(estado.email ?? null)} className="text-zinc-500 hover:underline">
            Usar outro e-mail
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={acao} onSubmit={() => setTrocouEmail(null)} className="space-y-4">
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
      <Campo rotulo="E-mail" name="email" type="email" autoComplete="email" defaultValue={trocouEmail ? "" : estado.email} required />
      <Campo
        rotulo="Senha"
        name="senha"
        type="password"
        autoComplete={modo === "entrar" ? "current-password" : "new-password"}
        minLength={8}
        required
        dica={modo === "cadastrar" ? "Pelo menos 8 caracteres. Depois enviamos um código para confirmar o e-mail." : undefined}
      />
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      <Botao type="submit" name="intencao" value={modo} disabled={ocupado} className="w-full">
        {ocupado ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta"}
      </Botao>
    </form>
  );
}
