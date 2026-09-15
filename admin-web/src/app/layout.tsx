import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UrTruck Control Center',
  description: 'UrTruck operational admin console',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
