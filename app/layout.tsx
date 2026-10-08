import type { Metadata } from 'next';
import './globals.css';
import './sandbox.css';

export const metadata: Metadata = {
  title: 'x402 Workshop — Interactive payment lab',
  description: 'Learn the x402 handshake by editing agent policy and inspecting every HTTP request, challenge, and response.',
  icons: { icon: '/favicon.svg' },
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
