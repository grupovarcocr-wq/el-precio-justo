import type { Metadata } from "next";
import { Caveat, Fredoka, Nunito } from "next/font/google";
import "./globals.css";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fredoka",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["500", "700", "800", "900"],
  variable: "--font-nunito",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-caveat",
});

export const metadata: Metadata = {
  title: "El Precio Justo — Té de Leandro Vargas Corao",
  description:
    "Juego tipo Kahoot para adivinar precios en colones. Té de Leandro Vargas Corao — TV para el host, celular para los invitados.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${fredoka.variable} ${nunito.variable} ${caveat.variable} antialiased`}
      >
        <style>{`
          :root {
            --font-display: var(--font-fredoka), system-ui, sans-serif;
            --font-body: var(--font-nunito), system-ui, sans-serif;
            --font-script: var(--font-caveat), cursive;
          }
        `}</style>
        {children}
      </body>
    </html>
  );
}
