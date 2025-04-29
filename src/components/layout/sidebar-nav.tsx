'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Receipt, FileText, BookOpen, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { FC } from 'react';

interface SidebarNavProps {
  isMobile?: boolean;
  className?: string;
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/expenses', label: 'Expenses', icon: DollarSign },
  { href: '/invoices', label: 'Invoices', icon: Receipt },
  { href: '/chart-of-accounts', label: 'Chart of Accounts', icon: BookOpen },
];

export const SidebarNav: FC<SidebarNavProps> = ({ isMobile = false, className }) => {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        'flex flex-col gap-2 px-2 py-4',
        isMobile ? 'flex-grow' : 'h-full', // Adjust height for mobile vs desktop
        className
      )}
    >
        {/* Logo/Title for mobile */}
       {isMobile && (
         <div className="mb-4 flex h-16 items-center justify-center border-b px-4 lg:h-[60px] lg:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-primary"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                <span className="">ExpenseWise</span>
            </Link>
         </div>
        )}
      {navItems.map((item) => (
        <Link key={item.href} href={item.href} passHref legacyBehavior>
          <Button
            variant={pathname.startsWith(item.href) ? 'secondary' : 'ghost'}
            className={cn(
              'w-full justify-start gap-2',
               pathname.startsWith(item.href)
                  ? 'bg-accent text-accent-foreground' // Use accent for active item
                  : 'text-foreground hover:bg-muted/50'
            )}
            aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Button>
        </Link>
      ))}
    </nav>
  );
};
