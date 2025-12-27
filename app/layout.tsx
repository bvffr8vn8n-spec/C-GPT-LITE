import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChatGPT-lite",
  description: "Упрощённый аналог интерфейса ChatGPT с тредами и генеративным UI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

