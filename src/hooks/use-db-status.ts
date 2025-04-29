
'use client';

import { useState, useEffect } from 'react';
import { checkDbConnection } from '@/lib/actions/health'; // Import the server action

interface DbStatusState {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useDbStatus(): DbStatusState {
  const [status, setStatus] = useState<DbStatusState>({
    isConnected: false,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates on unmounted component

    async function checkStatus() {
      try {
        const result = await checkDbConnection();
        if (isMounted) {
          setStatus({
            isConnected: result.connected,
            isLoading: false,
            error: result.connected ? null : 'Connection failed',
          });
        }
      } catch (err: any) {
        console.error("Error checking DB connection:", err);
        if (isMounted) {
          setStatus({
            isConnected: false,
            isLoading: false,
            error: err.message || 'An unknown error occurred',
          });
        }
      }
    }

    checkStatus();

    // Optional: Add a timer to re-check periodically?
    // const intervalId = setInterval(checkStatus, 60000); // Check every 60 seconds

    return () => {
      isMounted = false; // Cleanup function to set flag
      // clearInterval(intervalId); // Clear interval on unmount
    };
  }, []); // Empty dependency array means this runs once on mount

  return status;
}
