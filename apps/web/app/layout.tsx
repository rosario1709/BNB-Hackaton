import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ATLAS — Best execution for tokenized equities',
  description:
    'One intent. Every market. Best execution. Deterministic routing for tokenized equities on BNB Smart Chain.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
