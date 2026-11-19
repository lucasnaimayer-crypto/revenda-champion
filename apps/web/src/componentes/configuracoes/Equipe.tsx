"use client";

import { useActionState, useState } from "react";
import { convidar, type Resultado } from "@/app/(app)/configuracoes/equipe/acoes";
import { Aviso, Botao, Campo } from "@/componentes/ui";

export function FormConvite() {
  const [estado, acao, ocupado] = useActionState<Resultado, FormData>(convidar, {});
  return (
    <form action={acao} className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Campo rotulo="E-mail da pessoa" name="email" type="email" required maxLength={120} placeholder="nome@exemplo.com" />
        </div>
        <Botao type="submit" disabled={ocupado}>
          {ocupado ? "Criando…" : "Convidar"}
        </Botao>
      </div>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {estado.ok && <Aviso tipo="ok">{estado.ok}</Aviso>}
    </form>
  );
}

export function CopiarLink({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <span className="flex items-center gap-2">
      <input readOnly value={link} onFocus={(e) => e.target.select()} className="w-full min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-xs" />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          } catch {
            setCopiado(false);
          }
        }}
        className="shrink-0 rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-50"
      >
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </span>
  );
}
