import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Revenda Champion",
  description: "Gestão para revendedores Champion: catálogos, pedidos, estoque e vendas.",
  appleWebApp: { capable: true, title: "Revenda", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#18181b" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full bg-zinc-50 text-zinc-900">{children}</body>
    </html>
  );
}
