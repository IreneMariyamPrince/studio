
'use server';

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// Type definition for action result
type DbStatusResult = {
    connected: boolean;
    error?: string | null;
};

/**
 * Checks the database connection by attempting a simple query.
 * Catches PrismaClientInitializationError specifically.
 * @returns {Promise<DbStatusResult>} - Object indicating connection status.
 */
export async function checkDbConnection(): Promise<DbStatusResult> {
  try {
    // Attempt a very lightweight query to check connectivity.
    // Using $queryRaw`SELECT 1` is generally efficient.
    await prisma.$queryRaw`SELECT 1`;
    return { connected: true, error: null };
  } catch (error: unknown) {
    let errorMessage: string | null = 'Unknown error';

    if (error instanceof Prisma.PrismaClientInitializationError) {
      errorMessage = `Prisma Initialization Error: ${error.message}. Code: ${error.errorCode}`;
      // Log specific details for server-side debugging
      console.error(`[DB_HEALTH_CHECK_ERROR] ${errorMessage}`);
       // Provide more specific user-facing hint if it's the libssl issue
       if (error.message.includes('libssl')) {
            errorMessage = "Connection failed: Missing required system libraries (libssl). Check environment.";
       } else {
            errorMessage = "Connection failed: Could not initialize database connection. Check server logs.";
       }

    } else if (error instanceof Error) {
      errorMessage = `Generic Error: ${error.message}`;
       console.error(`[DB_HEALTH_CHECK_ERROR] ${errorMessage}`);
        errorMessage = "Connection failed: An unexpected error occurred."; // Generic message for client
    } else {
      console.error("[DB_HEALTH_CHECK_ERROR] Unknown error type:", error);
       errorMessage = "Connection failed due to an unknown error.";
    }

    return { connected: false, error: errorMessage };
  } finally {
     // Although Prisma manages connections, explicitly disconnecting
     // might be considered in a standalone health check script,
     // but generally not needed within Next.js actions using the shared instance.
     // await prisma.$disconnect(); // Typically not required here
  }
}
