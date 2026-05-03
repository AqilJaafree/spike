import type { Metadata } from 'next';
import { DM_Sans, DM_Mono } from 'next/font/google';
import { Web3Provider } from '@/lib/wagmi/provider';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['300', '400', '500', '600', '700', '800'],
});
const dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-dm-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Spike — Quantum-Safe DeFi Agent',
  description: 'Autonomous DeFi portfolio management powered by quantum optimization and post-quantum cryptography on 0G Network.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${dmMono.variable} antialiased`}
        style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", background: '#FBF7F0', color: '#555555' }}>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
