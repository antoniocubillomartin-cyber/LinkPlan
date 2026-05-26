import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LINK & PLAN',
  description: 'Planificador estratégico de ocio compartido'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="bg-[#FAF7F2] text-[#1A1714]">{children}</body>
    </html>
  );
}
