export const metadata = {
  title: "Controle EPI",
  description: "Controle de entrega de equipamentos de proteção individual"
};

import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
