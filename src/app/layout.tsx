import type { Metadata } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import "./globals.css";

const lilita = Lilita_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-lilita",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["500", "700", "800", "900"],
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  title: "El Precio Justo — Té de canastilla",
  description:
    "Juego de adivinar precios en colones para el té de canastilla. TV para el host, celular para los invitados.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${lilita.variable} ${nunito.variable} antialiased`}>
        <style>{`
          :root {
            --font-display: var(--font-lilita), system-ui, sans-serif;
            --font-body: var(--font-nunito), system-ui, sans-serif;
          }
        `}</style>
        {children}
      </body>
    </html>
  );
}
