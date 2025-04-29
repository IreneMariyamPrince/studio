'use client';

import type { FC, ReactNode } from 'react';
import { useState } from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { Header } from './header';
import { SidebarNav } from './sidebar-nav';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip'; // Ensure TooltipProvider is used
import Link from 'next/link'; // Import the Link component

interface DashboardLayoutProps {
  children: ReactNode;
  defaultLayout?: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize?: number;
}

export const DashboardLayout: FC<DashboardLayoutProps> = ({
  children,
  defaultLayout = [20, 80], // Default sidebar width 20%
  defaultCollapsed = false,
  navCollapsedSize = 4, // Icon size width percentage
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={(sizes: number[]) => {
          document.cookie = `react-resizable-panels:layout=${JSON.stringify(
            sizes
          )}`;
        }}
        className="min-h-screen items-stretch"
      >
        <ResizablePanel
          defaultSize={defaultLayout[0]}
          collapsedSize={navCollapsedSize}
          collapsible={true}
          minSize={15} // Min width before collapse
          maxSize={25} // Max width before collapse
          onCollapse={() => {
            setIsCollapsed(true);
            document.cookie = `react-resizable-panels:collapsed=${true}`;
          }}
          onExpand={() => {
            setIsCollapsed(false);
            document.cookie = `react-resizable-panels:collapsed=${false}`;
          }}
          className={cn(
            'hidden md:block', // Hide on mobile, handled by Sheet in Header
            isCollapsed ? 'min-w-[50px] transition-all duration-300 ease-in-out' : ''
          )}
        >
          {/* Sidebar Content */}
          <div className={cn("flex h-[52px] items-center justify-center", isCollapsed ? 'h-[52px]' : 'px-2')}>
             {/* Can add a logo/icon here that changes based on isCollapsed */}
              {!isCollapsed && (
                 <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-primary"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    <span className={cn(isCollapsed ? 'hidden' : 'block')}>ExpenseWise</span>
                 </Link>
              )}
              {isCollapsed && (
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-primary"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              )}
          </div>
          <SidebarNav isMobile={false} className={cn(isCollapsed ? 'items-center px-0' : '')} />
        </ResizablePanel>

        <ResizableHandle withHandle className="hidden md:flex" />

        <ResizablePanel defaultSize={defaultLayout[1]} minSize={30}>
          <div className="flex h-full flex-col">
            <Header />
            <main className="flex-1 overflow-y-auto bg-secondary/50 p-4 md:p-6 lg:p-8">
              {children}
            </main>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  );
};
