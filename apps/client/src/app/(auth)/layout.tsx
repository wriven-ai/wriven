import Link from 'next/link';
import { ReactNode } from 'react';
import WrivenLogo from '@/components/WrivenLogo';

/** Shared chrome for all auth pages (login, register, forgot/reset password). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative editorial-grid paper-grain">
      <div className="absolute top-6 right-6">
        <Link href="/" className="inline-block" aria-label="Wriven home">
          <WrivenLogo className="justify-end scale-110 hidden sm:flex" />
          <WrivenLogo textOnly className="justify-end scale-110 flex sm:hidden" />
        </Link>
      </div>
      {children}
    </div>
  );
}
