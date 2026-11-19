import type { Metadata, Viewport } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";

const openSans = Open_Sans({ subsets: ["latin"], variable: "--fonte-open-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Revenda Champion",
  description: "Gestão para revendedores Champion: catálogos, pedidos, estoque e vendas.",
  appleWebApp: { capable: true, title: "Revenda", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#171717" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${openSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-fundo text-tinta">{children}</body>
    </html>
  );
}
