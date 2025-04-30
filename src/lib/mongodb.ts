// src/lib/mongodb.ts
import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || 'finance'; // Default database name

if (!uri) {
  throw new Error('Please define the MONGO_URI environment variable inside .env');
}

let client: MongoClient | null = null;
let dbInstance: Db | null = null;

interface ConnectResult {
  client: MongoClient;
  db: Db;
}

/**
 * Connects to the MongoDB database and returns the client and db instance.
 * Implements a simple connection pooling mechanism.
 */
export async function connectToDatabase(): Promise<ConnectResult> {
  if (dbInstance && client && client.topology && client.topology.isConnected()) {
    // console.log("Using existing MongoDB connection.");
    return { client, db: dbInstance };
  }

  try {
    // console.log("Creating new MongoDB connection...");
    client = new MongoClient(uri!); // Non-null assertion because we check uri above
    await client.connect();
    dbInstance = client.db(dbName);
    console.log("Successfully connected to MongoDB.");
    return { client, db: dbInstance };
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    // Attempt to close client if connection failed partway through
    if (client) {
      await client.close();
      client = null;
      dbInstance = null;
    }
    throw new Error("Could not connect to MongoDB database.");
  }
}

/**
 * Attempts to close the MongoDB connection if it exists.
 */
export async function closeDatabaseConnection(): Promise<void> {
    if (client) {
        try {
            await client.close();
            console.log("MongoDB connection closed.");
            client = null;
            dbInstance = null;
        } catch (error) {
            console.error("Error closing MongoDB connection:", error);
        }
    }
}
