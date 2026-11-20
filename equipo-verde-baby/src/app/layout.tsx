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
  title: "Equipo Verde Baby Edition",
  description:
    "Party game multiplayer para baby shower: coincidí con la mayoría y quedate en el Equipo Verde.",
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
