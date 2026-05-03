import type { Metadata } from 'next';
import { Nunito, Nunito_Sans } from 'next/font/google';
import './globals.css';

const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito', weight: ['400', '600', '700', '800', '900'] });
const nunitoSans = Nunito_Sans({ subsets: ['latin'], variable: '--font-nunito-sans', weight: ['400', '600', '700'] });

export const metadata: Metadata = {
  title: 'Spike — Quantum-Safe DeFi Agent',
  description: 'Autonomous DeFi portfolio management powered by quantum optimization and post-quantum cryptography on 0G Network.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${nunito.variable} ${nunitoSans.variable} bg-cream text-charcoal antialiased`}>
        {children}
      </body>
    </html>
  );
}
