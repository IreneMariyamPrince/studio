'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  // Optional: Show a loading state while redirecting
  return (
    <div className="flex h-screen items-center justify-center">
      <p>Loading ExpenseWise...</p>
       {/* Or a spinner component */}
    </div>
  );
}
