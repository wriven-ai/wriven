import { cn } from '@/lib/utils';
import { Manrope } from 'next/font/google';
import './global.css';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });

export const metadata = {
  title: 'Wriven',
  description: 'AI First Content Management System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn('font-sans', manrope.variable)}>
      <body>{children}</body>
    </html>
  );
}
