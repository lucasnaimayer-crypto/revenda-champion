"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/painel", rotulo: "Painel" },
  { href: "/catalogos", rotulo: "Catálogos", dono: true },
  { href: "/pedidos", rotulo: "Pedidos", dono: true },
  { href: "/vendas", rotulo: "Vendas", dono: true },
  { href: "/clientes", rotulo: "Clientes" },
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
            className={`whitespace-nowrap border-b-2 px-3 py-2 font-medium ${ativo ? "border-white text-white" : "border-transparent text-white/60 hover:text-white"}`}
          >
            {i.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
