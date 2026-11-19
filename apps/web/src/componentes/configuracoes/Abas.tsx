import Link from "next/link";

const ABAS = [
  { href: "/configuracoes", rotulo: "Regras de preço" },
  { href: "/configuracoes/equipe", rotulo: "Equipe" },
  { href: "/configuracoes/dados", rotulo: "Seus dados" },
];

export default function Abas({ atual }: { atual: string }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-zinc-200 text-sm">
      {ABAS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 ${a.href === atual ? "border-zinc-900 font-medium" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
