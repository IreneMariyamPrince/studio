'use client';

import type { FC } from 'react';
import { Menu, Search, User, Settings, LogOut, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { SidebarNav } from './sidebar-nav'; // Assuming SidebarNav exists
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface HeaderProps {
  onMenuClick?: () => void;
  className?: string;
}

export const Header: FC<HeaderProps> = ({ onMenuClick, className }) => {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b bg-background px-4 shadow-sm sm:px-6 md:px-8',
        className
      )}
    >
      <div className="flex items-center gap-4">
        {/* Mobile Sidebar Trigger */}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 md:hidden"
              onClick={onMenuClick}
              aria-label="Toggle navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col p-0">
             {/* Pass navigation items */}
             <SidebarNav isMobile={true} />
          </SheetContent>
        </Sheet>

        {/* Logo/Title */}
        <Link href="/" className="hidden text-lg font-semibold md:block">
          ExpenseWise
        </Link>

        {/* Optional Search */}
        {/* <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            className="pl-8 sm:w-[300px] md:w-[200px] lg:w-[300px] h-9"
          />
        </div> */}
      </div>

      <div className="flex items-center gap-4">
        {/* Notifications (Optional) */}
        <Button variant="ghost" size="icon" className="rounded-full">
          <Bell className="h-5 w-5" />
          <span className="sr-only">Toggle notifications</span>
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
               <Avatar className="h-8 w-8">
                <AvatarImage src="https://picsum.photos/32/32" alt="@shadcn" />
                <AvatarFallback>EW</AvatarFallback>
              </Avatar>
              <span className="sr-only">Toggle user menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
