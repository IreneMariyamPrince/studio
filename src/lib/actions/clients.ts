'use server';

import { revalidatePath } from 'next/cache';
import { Collection, ObjectId, WithId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { clientSchema, clientFormSchema, ClientSchema } from '@/lib/schemas/client';
import { getTenantId } from '@/lib/utils/tenant';
import { z } from 'zod'; // Import z

// Type definition for MongoDB documents
type ClientDocument = Omit<ClientSchema, 'id'> & { _id?: ObjectId; tenantId: string; createdAt?: Date; updatedAt?: Date };

// Helper to get the clients collection
async function getClientsCollection(): Promise<Collection<ClientDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<ClientDocument>('clients');
}

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
  const context = `getClients (Tenant: ${tenantId})`;

  try {
    const clientsCollection = await getClientsCollection();
    const clientsCursor = clientsCollection.find({ tenantId: tenantId }).sort({ name: 1 });
    const clientsArray = await clientsCursor.toArray();

    // Map MongoDB document to schema
    return clientsArray.map(doc => clientSchema.parse({
        ...doc,
        id: doc._id?.toHexString(),
        email: doc.email ?? undefined,
        phone: doc.phone ?? undefined,
        address: doc.address ?? undefined,
        paymentTerms: doc.paymentTerms ?? undefined,
        balanceDue: doc.balanceDue ?? 0,
    }));
  } catch (error) {
     console.error(`[ACTION_ERROR] ${context}:`, error);
     console.warn(`[DB_WARN] Returning empty clients list for tenant ${tenantId} due to unexpected error.`);
    return [];
  }
}

// --- Add Client for the current tenant ---
export async function addClient(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot add client.' };
   }
   const context = `addClient (Tenant: ${tenantId})`;

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
    console.error(`[VALIDATION_ERROR] ${context}:`, fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  try {
    const clientsCollection = await getClientsCollection();

    // Optional: Check if email already exists for this tenant
    if (validatedFields.data.email) {
        const existingClient = await clientsCollection.findOne({ tenantId, email: validatedFields.data.email });
        if (existingClient) {
            return {
                success: false,
                message: 'Database Error: A client with this email already exists for this tenant.',
                error: 'Duplicate Key',
                fieldErrors: { email: ['This email is already registered for this tenant.'] }
            };
        }
    }


    const newClientDocument: Omit<ClientDocument, '_id'> = {
        ...validatedFields.data,
        tenantId: tenantId,
        balanceDue: 0, // Initial balance
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const result = await clientsCollection.insertOne(newClientDocument);
     if (!result.insertedId) {
        throw new Error("Failed to insert new client document.");
    }

    revalidatePath('/clients');
    revalidatePath('/invoices/new');
    return { success: true, message: `Client "${newClientDocument.name}" added successfully.`, data: { ...newClientDocument, id: result.insertedId.toHexString() } };
  } catch (error: unknown) {
    console.error(`[DB_ERROR] ${context}:`, error);
    // Handle potential duplicate key errors if index is set on email+tenantId
    if ((error as any).code === 11000 && (error as any).message.includes('email')) {
        return {
            success: false,
            message: 'Database Error: A client with this email already exists for this tenant.',
            error: 'Duplicate Key',
            fieldErrors: { email: ['This email is already registered for this tenant.'] }
        };
    }
    return {
        success: false,
        message: 'Database Error: Failed to add client.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Update Client for the current tenant ---
const updateClientFormSchema = clientFormSchema.extend({
  id: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid client ID." }),
});

export async function updateClient(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot update client.' };
   }
   const clientIdString = formData.get('id') as string;
   if (!clientIdString) return { success: false, message: "Client ID missing." };
   const context = `updateClient (ID: ${clientIdString}, Tenant: ${tenantId})`;

    let clientId: ObjectId;
    try {
        clientId = new ObjectId(clientIdString);
    } catch (e) {
        return { success: false, message: 'Invalid Client ID format.' };
    }

   const rawData = Object.fromEntries(formData.entries());
   const validatedFields = updateClientFormSchema.safeParse({
        id: clientIdString, // Validate string format
        name: rawData.name,
        email: rawData.email || undefined,
        phone: rawData.phone || undefined,
        address: rawData.address || undefined,
        paymentTerms: rawData.paymentTerms || undefined,
    });

   if (!validatedFields.success) {
        const fieldErrors = validatedFields.error.flatten().fieldErrors;
        console.error(`[VALIDATION_ERROR] ${context}:`, fieldErrors);
        return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
    }

    const { id, ...updateData } = validatedFields.data;

    try {
        const clientsCollection = await getClientsCollection();

        // Verify client exists and belongs to tenant
        const client = await clientsCollection.findOne({ _id: clientId, tenantId: tenantId });
        if (!client) {
            return { success: false, message: 'Client not found or access denied.', error: 'Not Found' };
        }

         // Optional: Check for duplicate email if email is being changed
        if (updateData.email && updateData.email !== client.email) {
             const existingEmail = await clientsCollection.findOne({ _id: { $ne: clientId }, tenantId, email: updateData.email });
             if (existingEmail) {
                  return {
                      success: false, message: `Database Error: Email "${updateData.email}" is already in use by another client for this tenant.`, error: 'Duplicate Key',
                      fieldErrors: { email: [`Email "${updateData.email}" is already in use.`] }
                  };
             }
        }

        const result = await clientsCollection.updateOne(
            { _id: clientId, tenantId: tenantId }, // Ensure tenant match
            { $set: { ...updateData, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
            return { success: false, message: 'Client not found or access denied during update.', error: 'Not Found' };
        }
         if (result.modifiedCount === 0) {
             return { success: true, message: 'Client details unchanged.' };
         }


        revalidatePath('/clients');
        // revalidatePath(`/clients/${clientIdString}`); // If client detail pages exist
        return { success: true, message: 'Client updated successfully.' };
    } catch (error) {
        console.error(`[DB_ERROR] ${context}:`, error);
        // Handle potential duplicate key errors on email if index exists
         if ((error as any).code === 11000 && (error as any).message.includes('email')) {
             return {
                 success: false, message: `Database Error: Email "${updateData.email}" is already in use.`, error: 'Duplicate Key',
                 fieldErrors: { email: ['Email already in use.'] }
             };
         }
        return { success: false, message: 'Database Error: Failed to update client.' };
    }
}

// --- Delete Client for the current tenant ---
export async function deleteClient(idString: string): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot delete client.' };
   }
   if (!idString) return { success: false, message: "Client ID missing." };
   const context = `deleteClient (ID: ${idString}, Tenant: ${tenantId})`;

    let clientId: ObjectId;
    try {
        clientId = new ObjectId(idString);
    } catch (e) {
        return { success: false, message: 'Invalid Client ID format.' };
    }

   try {
        const clientsCollection = await getClientsCollection();
        const invoicesCollection = (await connectToDatabase()).db.collection('invoices');

        // 1. Verify client exists and belongs to tenant
        const client = await clientsCollection.findOne({ _id: clientId, tenantId: tenantId }, { projection: { _id: 1 } });
        if (!client) {
             return { success: false, message: 'Client not found or access denied.', error: 'Not Found' };
        }

        // 2. Check for related invoices (important!)
         const relatedInvoice = await invoicesCollection.findOne({ clientId: clientId, tenantId: tenantId }, { projection: { _id: 1 } }); // Assuming tenantId is also on invoices
         if (relatedInvoice) {
             return { success: false, message: 'Cannot delete client: Client has associated invoices.', error: 'Constraint Violation' };
         }

        // 3. Perform delete
        const result = await clientsCollection.deleteOne({ _id: clientId, tenantId: tenantId });

         if (result.deletedCount === 0) {
             return { success: false, message: 'Client not found or access denied during deletion.', error: 'Not Found' };
         }

        revalidatePath('/clients');
        return { success: true, message: 'Client deleted successfully.' };
   } catch (error) {
       console.error(`[DB_ERROR] ${context}:`, error);
       return { success: false, message: 'Database Error: Failed to delete client.' };
   }
}
