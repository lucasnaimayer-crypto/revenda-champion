"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/painel", rotulo: "Painel" },
  { href: "/catalogos", rotulo: "Catálogos", dono: true },
  { href: "/pedidos", rotulo: "Pedidos", dono: true },
  { href: "/estoque", rotulo: "Estoque" },
  { href: "/configuracoes", rotulo: "Configurações", dono: true },
];

export default function Navegacao({ dono }: { dono: boolean }) {
  const caminho = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto text-sm">
      {ITENS.filter((i) => dono || !i.dono).map((i) => {
        const ativo = caminho === i.href || caminho.startsWith(`${i.href}/`);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 ${ativo ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            {i.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
