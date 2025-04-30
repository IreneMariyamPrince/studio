// src/lib/mongodb.ts
import { MongoClient, Db } from "mongodb";

// Ensure this file is only used in a server-side context
if (typeof window !== "undefined") {
  throw new Error(
    "This file should only be used in a server-side context."
  );
}

let client: MongoClient | null = null;
let dbInstance: Db | null = null;

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || "finance"; // Default database name

if (!uri)
  throw new Error(
    "Please define the MONGO_URI environment variable inside .env"
  );

/**
 * Connects to the MongoDB database and returns the client and db instance.
 * Implements a simple connection pooling mechanism.
 */
export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  try {
    if (dbInstance && client && client.topology && client.topology.isConnected()) {
      return { client, db: dbInstance };
    }

    client = new MongoClient(uri);
    await client.connect();
    dbInstance = client.db(dbName);
    console.log("Successfully connected to MongoDB.");
    return { client, db: dbInstance };
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw new Error(`Could not connect to MongoDB database. ${error}`);
  }
}

/**
 * Attempts to close the MongoDB connection if it exists.
 */
export async function closeDatabaseConnection(): Promise<void> {  
  try {
    if (client) {
      await client.close();
      console.log("MongoDB connection closed.");
      client = null;
      dbInstance = null;
    }
  } catch (error) {
    console.error("Error closing MongoDB connection:", error);
    throw error;
  }
}
