
'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { clientSchema, clientFormSchema, ClientSchema } from '@/lib/schemas/client';
import { Prisma } from '@prisma/client';
import { getTenantId } from '@/lib/utils/tenant'; // Helper to get tenant ID

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};

// --- Get Clients for the current tenant ---
export async function getClients(): Promise<ClientSchema[]> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    console.error("[ACTION_ERROR] Tenant ID not found in getClients.");
    return [];
  }

  try {
    const clients = await prisma.client.findMany({
        where: { tenantId: tenantId }, // Filter by tenant
        orderBy: { name: 'asc' }
    });
    // Validate each client against the schema before returning
    return clients.map(client => clientSchema.parse({
        ...client,
        email: client.email ?? undefined,
        phone: client.phone ?? undefined,
        address: client.address ?? undefined,
        paymentTerms: client.paymentTerms ?? undefined,
        balanceDue: client.balanceDue?.toNumber() ?? 0, // Handle Decimal
    }));
  } catch (error) {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error(`[ACTION_ERROR] Prisma Initialization Error in getClients (Tenant: ${tenantId}):`, error.message);
         throw new Error("Database connection failed.");
     } else {
        console.error(`[ACTION_ERROR] Error fetching clients for tenant ${tenantId}:`, error);
        throw new Error("Failed to fetch clients.");
     }
    // return []; // Fallback
  }
}

// --- Add Client for the current tenant ---
export async function addClient(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot add client.' };
   }

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
    console.error(`[VALIDATION_ERROR] addClient (Tenant: ${tenantId}):`, fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  try {
    const newClient = await prisma.client.create({
      data: {
          ...validatedFields.data,
          tenantId: tenantId, // Associate with the current tenant
      },
    });

    revalidatePath('/clients'); // Revalidate the client list page
    revalidatePath('/invoices/new'); // Revalidate new invoice page if client dropdown is there
    return { success: true, message: `Client "${newClient.name}" added successfully.`, data: newClient };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error(`[ACTION_ERROR] Prisma Initialization Error in addClient (Tenant: ${tenantId}):`, error.message);
        return { success: false, message: 'Database Connection Error. Failed to add client.', error: 'Initialization Error' };
    }

    console.error(`[DB_ERROR] Failed to add client for tenant ${tenantId}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Check unique constraint for email within the tenant
      if (error.code === 'P2002' && (error.meta?.target as string[])?.includes('email') && (error.meta?.target as string[])?.includes('tenantId') ) {
        return {
            success: false,
            message: 'Database Error: A client with this email already exists for this tenant.',
            error: error.code,
            fieldErrors: { email: ['This email is already registered for this tenant.'] }
         };
      }
    }
    return {
        success: false,
        message: 'Database Error: Failed to add client.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Update Client for the current tenant ---
export async function updateClient(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot update client.' };
   }
   const clientId = formData.get('id') as string;
   if (!clientId) return { success: false, message: "Client ID missing." };

   const rawData = Object.fromEntries(formData.entries());
   const validatedFields = clientFormSchema.safeParse({ /* ... parse rawData ... */ });

   if (!validatedFields.success) { /* handle error */ }

    try {
        // 1. Verify client belongs to the current tenant
        const client = await prisma.client.findUnique({ where: { id: clientId }, select: { tenantId: true } });
        if (!client) return { success: false, message: 'Client not found.' };
        if (client.tenantId !== tenantId) return { success: false, message: 'Authorization failed.' };

        // 2. Perform update
        const updatedClient = await prisma.client.update({
            where: { id: clientId },
            data: validatedFields.data,
        });

        revalidatePath('/clients');
        revalidatePath(`/clients/${clientId}`); // Revalidate specific client page if exists
        return { success: true, message: 'Client updated successfully.' };
    } catch (error) {
        // Handle DB errors (connection, unique constraints like email)
        return { success: false, message: 'Database Error: Failed to update client.' /* Add specific error handling */ };
    }
}

// --- Delete Client for the current tenant ---
export async function deleteClient(id: string): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot delete client.' };
   }
   if (!id) return { success: false, message: "Client ID missing." };

   try {
        // 1. Verify client belongs to the current tenant
        const client = await prisma.client.findUnique({ where: { id }, select: { tenantId: true } });
        if (!client) return { success: false, message: 'Client not found.' };
        if (client.tenantId !== tenantId) return { success: false, message: 'Authorization failed.' };

        // 2. Check for related invoices (onDelete: Restrict will prevent deletion if invoices exist)
        // Prisma will throw P2003 if related invoices exist

        // 3. Perform delete
        await prisma.client.delete({ where: { id } });

        revalidatePath('/clients');
        return { success: true, message: 'Client deleted successfully.' };
   } catch (error) {
       if (error instanceof Prisma.PrismaClientKnownRequestError) {
           if (error.code === 'P2003') { // Foreign key constraint violation
               return { success: false, message: 'Cannot delete client: Client has associated invoices.', error: error.code };
           }
           if (error.code === 'P2025') { // Record not found
               return { success: false, message: 'Client not found.', error: error.code };
           }
       }
       // Handle other DB errors (connection etc.)
       return { success: false, message: 'Database Error: Failed to delete client.' /* Add specific error handling */ };
   }
}
