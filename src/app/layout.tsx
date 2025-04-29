import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
// import { FirebaseProvider } from '@/context/firebase-provider'; // Assuming you create this context

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ExpenseWise',
  description: 'Manage your company expenses and invoices efficiently.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* <FirebaseProvider> */}
          {children}
          <Toaster />
        {/* </FirebaseProvider> */}
      </body>
    </html>
  );
}
