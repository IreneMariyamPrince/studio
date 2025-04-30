
'use server';

import { connectToDatabase, closeDatabaseConnection } from '@/lib/mongodb';

// Type definition for action result
type DbStatusResult = {
    connected: boolean;
    error?: string | null;
};

/**
 * Checks the MongoDB connection status using the driver's ping command.
 * @returns {Promise<DbStatusResult>} - Object indicating connection status.
 */
export async function checkDbConnection(): Promise<DbStatusResult> {
  let client;
  try {
    const { db } = await connectToDatabase();
    // The ping command is cheap and does not require auth.
    await db.command({ ping: 1 });
    // console.log("MongoDB connection check successful (ping).");
    return { connected: true, error: null };
  } catch (error: unknown) {
    console.error("[DB_HEALTH_CHECK_ERROR] MongoDB connection failed:", error);
    let errorMessage = "Connection failed: Could not connect to the database.";
    if (error instanceof Error) {
        if (error.message.includes('Authentication failed')) {
            errorMessage = "Connection failed: Authentication error. Check credentials.";
        } else if (error.message.includes('querySrv ENOTFOUND') || error.message.includes('queryTxt ENOTFOUND')) {
            errorMessage = "Connection failed: DNS resolution error. Check connection string or network.";
        } else {
             errorMessage = `Connection failed: ${error.message}`;
        }
    }
    // No need to explicitly close connection here as connectToDatabase handles errors
    return { connected: false, error: errorMessage };
  }
  // Note: We don't explicitly close the connection here to allow reuse.
  // A separate mechanism might be needed for graceful shutdown if required.
}
