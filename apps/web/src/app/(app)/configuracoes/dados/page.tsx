import Abas from "@/componentes/configuracoes/Abas";
import { Cartao, Titulo } from "@/componentes/ui";
import { exigirDono } from "@/lib/sessao";

const ARQUIVOS = [
  { arquivo: "clientes.csv", rotulo: "Clientes", texto: "Nome, telefone, e-mail, cidade e observações." },
  { arquivo: "vendas.csv", rotulo: "Vendas", texto: "Uma linha por peça vendida, com cliente, preço, desconto, custo e comissão." },
  { arquivo: "parcelas.csv", rotulo: "Parcelas", texto: "Recebimentos de cada venda, pagos e em aberto." },
  { arquivo: "estoque.csv", rotulo: "Estoque", texto: "Produtos, quantidade, custo e preço de venda atuais." },
];

export default async function Dados() {
  await exigirDono();
  return (
    <>
      <Titulo>Configurações</Titulo>
      <Abas atual="/configuracoes/dados" />
      <p className="mb-4 max-w-2xl text-sm text-zinc-600">
        Os dados da sua revenda são seus. Baixe tudo em planilhas que o Excel abre direto. Os dados dos seus clientes só ficam visíveis para você e sua equipe; a Champion e os
        representantes não têm acesso a eles.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {ARQUIVOS.map((a) => (
          <Cartao key={a.arquivo}>
            <h2 className="font-semibold">{a.rotulo}</h2>
            <p className="mb-3 mt-1 text-sm text-zinc-500">{a.texto}</p>
            <a href={`/configuracoes/dados/${a.arquivo}`} className="inline-flex rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50">
              Baixar {a.arquivo}
            </a>
          </Cartao>
        ))}
      </div>
    </>
  );
}
