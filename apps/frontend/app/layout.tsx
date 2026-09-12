import type { Metadata } from 'next';
import { AppShell } from '../components/layout/app-shell';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'CodeSync',
  description: 'CodeSync development environment',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
