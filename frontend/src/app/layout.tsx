import type { Metadata } from 'next';
import { Fraunces, DM_Sans } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/authContext';

const display = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display'
});
const sans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans'
});

export const metadata: Metadata = {
  title: 'Gatos y Cañas',
  description: 'Planificador de ocio compartido para ti y los tuyos'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-[#FAF6EE] text-[#1A1714] antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
