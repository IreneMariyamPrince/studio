
'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { clientSchema, clientFormSchema, ClientSchema } from '@/lib/schemas/client';
import { Prisma } from '@prisma/client';

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};

// --- Get Clients ---
export async function getClients(): Promise<ClientSchema[]> {
  try {
    const clients = await prisma.client.findMany({
        orderBy: { name: 'asc' }
    });
    // Validate each client against the schema before returning
    return clients.map(client => clientSchema.parse({
        ...client,
        email: client.email ?? undefined,
        phone: client.phone ?? undefined,
        address: client.address ?? undefined,
        paymentTerms: client.paymentTerms ?? undefined,
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[ACTION_ERROR] Prisma Initialization Error fetching clients:", error.message);
         if (error.message.includes('libssl')) {
              console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library. Ensure OpenSSL is installed. Returning empty list.");
         } else {
              console.error("Database connection failed. Returning empty list.");
         }
        return [];
    }
    console.error("[ACTION_ERROR] Error fetching clients:", error);
    return [];
  }
}

// --- Add Client ---
export async function addClient(formData: FormData): Promise<ActionResult> {
  const rawData = Object.fromEntries(formData.entries());

  const validatedFields = clientFormSchema.safeParse({
    name: rawData.name,
    email: rawData.email || undefined,
    phone: rawData.phone || undefined,
    address: rawData.address || undefined,
    paymentTerms: rawData.paymentTerms || undefined,
  });

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    console.error("[VALIDATION_ERROR] addClient:", fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  try {
    const newClient = await prisma.client.create({
      data: validatedFields.data,
    });

    revalidatePath('/clients'); // Revalidate the client list page
    revalidatePath('/invoices/new'); // Revalidate new invoice page if client dropdown is there
    return { success: true, message: `Client "${newClient.name}" added successfully.`, data: newClient };
  } catch (error: unknown) {
    console.error("[DB_ERROR] Failed to add client:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002' && error.meta?.target === 'Client_email_key') {
        return {
            success: false,
            message: 'Database Error: A client with this email already exists.',
            error: error.code,
            fieldErrors: { email: ['This email is already registered.'] }
         };
      }
    } else if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[DB_ERROR] Prisma Initialization Error during client creation:", error.message);
         if (error.message.includes('libssl')) {
              console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library.");
         }
        return {
            success: false,
            message: 'Database Connection Error. Failed to add client.',
            error: 'Initialization Error'
        };
    }
    return {
        success: false,
        message: 'Database Error: Failed to add client.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Update Client ---
export async function updateClient(formData: FormData): Promise<ActionResult> {
  // Placeholder: Implement update logic similar to addClient
  console.log("Update client action called (Not Implemented)", Object.fromEntries(formData.entries()));
   const clientId = formData.get('id') as string;
   if (!clientId) return { success: false, message: "Client ID missing." };
   // Validation, Prisma update, revalidation...
  return { success: false, message: 'Update Client - Not Implemented Yet' };
}

// --- Delete Client ---
export async function deleteClient(id: string): Promise<ActionResult> {
  // Placeholder: Implement delete logic
   console.log("Delete client action called (Not Implemented)", id);
   if (!id) return { success: false, message: "Client ID missing." };
   // Check for related invoices first (onDelete: Restrict)
   // Prisma delete, revalidation...
  return { success: false, message: 'Delete Client - Not Implemented Yet' };
}
