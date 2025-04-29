
'use server';

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// Type definition for action result
type DbStatusResult = {
    connected: boolean;
    error?: string | null;
};

// Flag to prevent spamming the console with the same libssl error
let libsslErrorLogged = false;

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
             if (!libsslErrorLogged) {
                 console.error("DATABASE CONNECTION FAILED: Prisma cannot find the required `libssl` system library (e.g., libssl.so.1.1). This is an ENVIRONMENT ISSUE. Please ensure OpenSSL 1.1 or 3 (check Prisma version compatibility) is installed and accessible in your deployment environment.");
                 libsslErrorLogged = true; // Prevent repeated logging
             }
       } else {
            errorMessage = "Connection failed: Could not initialize database connection. Check connection string and database server status.";
            console.error(`[DB_HEALTH_CHECK_ERROR] Prisma Initialization Error: ${error.message}`); // Log other init errors
       }
    } else if (error instanceof Error) {
      logMessage = `Generic Error: ${error.message}`;
      errorMessage = "Connection failed: An unexpected error occurred while connecting to the database.";
       console.error(`[DB_HEALTH_CHECK_ERROR] ${logMessage}`); // Log detailed error server-side
    } else {
      logMessage = `Unknown error type: ${String(error)}`;
      errorMessage = "Connection failed due to an unknown error.";
       console.error(`[DB_HEALTH_CHECK_ERROR] ${logMessage}`); // Log detailed error server-side
    }

    return { connected: false, error: errorMessage }; // Return user-friendly message
  }
  // No finally block needed as Prisma manages connections in the pool.
}
