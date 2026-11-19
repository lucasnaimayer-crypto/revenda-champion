import type { MetadataRoute } from "next";

// Permite instalar o sistema na tela inicial do celular.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Revenda Champion",
    short_name: "Revenda",
    description: "Catálogos, pedidos, estoque e vendas do revendedor Champion.",
    start_url: "/painel",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#171717",
    lang: "pt-BR",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
