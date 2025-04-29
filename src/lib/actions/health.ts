
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
    await prisma.$queryRaw`SELECT 1`;
    return { connected: true, error: null };
  } catch (error: unknown) {
    let errorMessage: string | null = 'Unknown database error occurred.';
    let logMessage: string = 'Unknown error type';

    if (error instanceof Prisma.PrismaClientInitializationError) {
      logMessage = `Prisma Initialization Error: ${error.message}. Code: ${error.errorCode}`;
       // Provide more specific user-facing hint if it's the libssl issue
       if (error.message.includes('libssl')) {
            errorMessage = "Connection failed: Missing required system libraries (e.g., libssl). Check server environment and Prisma documentation.";
       } else {
            errorMessage = "Connection failed: Could not initialize database connection. Check connection string and database server status.";
       }
    } else if (error instanceof Error) {
      logMessage = `Generic Error: ${error.message}`;
      errorMessage = "Connection failed: An unexpected error occurred while connecting to the database.";
    } else {
      logMessage = `Unknown error type: ${String(error)}`;
      errorMessage = "Connection failed due to an unknown error.";
    }

    console.error(`[DB_HEALTH_CHECK_ERROR] ${logMessage}`); // Log detailed error server-side
    return { connected: false, error: errorMessage }; // Return user-friendly message
  }
  // No finally block needed as Prisma manages connections in the pool.
}
