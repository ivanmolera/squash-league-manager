import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Squash League Manager",
  description: "Gestion de ligas, equipos, torneos y rankings de squash."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
