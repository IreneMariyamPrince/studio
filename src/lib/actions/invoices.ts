
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { invoiceSchema, invoiceItemSchema, clientSchema, InvoiceSchema, invoiceFormSchema } from '@/lib/schemas/invoice';
import type { Prisma } from '@prisma/client'; // Import Prisma types

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};

// --- Client Actions ---

// Schema for client creation (omit server-generated fields)
const createClientSchema = clientSchema.omit({ id: true, createdAt: true, updatedAt: true });

export async function getClients(): Promise<ClientSchema[]> {
  try {
    const clients = await prisma.client.findMany({ orderBy: { name: 'asc' } });
    // Validate on fetch (optional but good practice)
    return clients.map(client => clientSchema.parse({
        ...client,
        email: client.email ?? undefined,
        address: client.address ?? undefined,
    }));
  } catch (error) {
    console.error("[ACTION_ERROR] Error fetching clients:", error);
    return [];
  }
}

export async function addClient(formData: FormData): Promise<ActionResult> {
  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = createClientSchema.safeParse({
      ...rawData,
      email: rawData.email || undefined, // Treat empty string as undefined for optional email
      address: rawData.address || undefined,
  });

  if (!validatedFields.success) {
     const fieldErrors = validatedFields.error.flatten().fieldErrors;
     console.error("[VALIDATION_ERROR] addClient:", fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  try {
    const client = await prisma.client.create({ data: validatedFields.data });
    revalidatePath('/invoices/new'); // Revalidate invoice form to show new client
    revalidatePath('/clients'); // Or relevant client page if exists
    return { success: true, message: `Client "${client.name}" created.`, data: client };
  } catch (error: unknown) {
    console.error("[DB_ERROR] Failed to create client:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002' && (error.meta?.target as string[])?.includes('email')) {
            return {
                success: false,
                message: 'Database Error: Client email already exists.',
                error: error.code,
                fieldErrors: { email: ['Email already exists.'] }
             };
        }
     }
    return {
        success: false,
        message: 'Database Error: Failed to create client.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Invoice Actions ---

// Helper to generate the next invoice number
async function getNextInvoiceNumber(): Promise<string> {
  try {
      const lastInvoice = await prisma.invoice.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { invoiceNumber: true },
      });

      if (!lastInvoice || !lastInvoice.invoiceNumber) {
        return 'INV-0001'; // Start with 4 digits
      }

      const match = lastInvoice.invoiceNumber.match(/INV-(\d+)/);
      if (match && match[1]) {
        const nextNum = parseInt(match[1], 10) + 1;
        return `INV-${String(nextNum).padStart(4, '0')}`; // Pad to 4 digits
      }

      // Fallback if format is unexpected (less likely now)
      console.warn("Unexpected invoice number format found. Generating fallback.");
      const count = await prisma.invoice.count();
      return `INV-${String(count + 1).padStart(4, '0')}`;
  } catch (error) {
      console.error("[HELPER_ERROR] Failed to get next invoice number:", error);
      // Provide a safe fallback in case of DB error during lookup
      return `INV-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  }
}

export async function getInvoices(): Promise<InvoiceSchema[]> {
  try {
    const invoices = await prisma.invoice.findMany({
      include: {
          client: { select: { id: true, name: true, email: true, address: true } }, // Select needed client fields
          items: true // Include all item fields for now
        },
      orderBy: { issueDate: 'desc' },
    });

     // Parse and potentially transform data before returning
     return invoices.map(inv => invoiceSchema.parse({
         ...inv,
         issueDate: new Date(inv.issueDate), // Ensure Date objects
         dueDate: new Date(inv.dueDate),
         // Ensure optional fields are handled
         notes: inv.notes ?? undefined,
         // Parse client and items strictly according to schema
         client: clientSchema.parse({
             ...inv.client,
             email: inv.client.email ?? undefined,
             address: inv.client.address ?? undefined,
         }),
         items: inv.items.map(item => invoiceItemSchema.parse({
             ...item,
             // No optional fields in item schema currently
         })),
     }));

  } catch (error) {
    console.error("[ACTION_ERROR] Error fetching invoices:", error);
    return [];
  }
}

export async function getInvoiceById(id: string): Promise<InvoiceSchema | null> {
  if (!id) return null;
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
       include: {
          client: { select: { id: true, name: true, email: true, address: true } },
          items: true
        },
    });
     if (!invoice) return null;

     // Parse and return
     return invoiceSchema.parse({
        ...invoice,
        issueDate: new Date(invoice.issueDate),
        dueDate: new Date(invoice.dueDate),
        notes: invoice.notes ?? undefined,
        client: clientSchema.parse({
             ...invoice.client,
             email: invoice.client.email ?? undefined,
             address: invoice.client.address ?? undefined,
        }),
        items: invoice.items.map(item => invoiceItemSchema.parse(item)),
     });
  } catch (error) {
     console.error(`[ACTION_ERROR] Error fetching invoice ${id}:`, error);
    return null;
  }
}


export async function createInvoice(formData: FormData): Promise<ActionResult> {
   // 1. Validate basic invoice fields first
   const basicInvoiceData = {
        clientId: formData.get('clientId'),
        issueDate: formData.get('issueDate'),
        dueDate: formData.get('dueDate'),
        status: formData.get('status') || 'Draft',
        notes: formData.get('notes'),
    };

   const basicValidation = invoiceFormSchema.omit({ items: true }).safeParse({
        ...basicInvoiceData,
        issueDate: basicInvoiceData.issueDate ? new Date(basicInvoiceData.issueDate as string) : undefined,
        dueDate: basicInvoiceData.dueDate ? new Date(basicInvoiceData.dueDate as string) : undefined,
        notes: basicInvoiceData.notes || undefined, // map empty to undefined
   });

    if (!basicValidation.success) {
        const fieldErrors = basicValidation.error.flatten().fieldErrors;
        console.error("[VALIDATION_ERROR] createInvoice (basic):", fieldErrors);
        return { success: false, message: 'Basic invoice validation failed.', error: "Validation Error", fieldErrors };
    }

    // 2. Parse and validate items
   const itemsJson = formData.get('items') as string;
   let parsedItems: any[];
   try {
     if (!itemsJson) throw new Error("Invoice items are missing.");
     parsedItems = JSON.parse(itemsJson);
     if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
         throw new Error("Invoice must have at least one item.");
     }
   } catch (error) {
     console.error("[VALIDATION_ERROR] createInvoice (items JSON parsing):", error);
     return { success: false, message: 'Invalid invoice items data format.', error: "Validation Error", fieldErrors: { items: ['Invalid items format or missing items.'] } };
   }

   // Validate each item using the schema and calculate totals
   const validatedItemsData: { description: string; quantity: number; unitPrice: number; total: number }[] = [];
   let calculatedTotal = 0;
   const itemErrors: string[] = [];

   for (let i = 0; i < parsedItems.length; i++) {
       const item = parsedItems[i];
       const itemValidation = invoiceItemSchema.omit({ id: true, invoiceId: true }).safeParse({
           description: item.description,
           quantity: parseInt(item.quantity, 10), // Ensure integer
           unitPrice: parseFloat(item.unitPrice), // Ensure float
       });

       if (!itemValidation.success) {
            const errors = itemValidation.error.flatten().fieldErrors;
            // Aggregate errors for the 'items' field
            Object.values(errors).flat().forEach(errMsg => itemErrors.push(`Item ${i+1}: ${errMsg}`));
       } else {
           const validItem = itemValidation.data;
           const itemTotal = validItem.quantity * validItem.unitPrice;
            validatedItemsData.push({ ...validItem, total: itemTotal });
            calculatedTotal += itemTotal;
       }
   }

    if (itemErrors.length > 0) {
        console.error("[VALIDATION_ERROR] createInvoice (items validation):", itemErrors);
        return { success: false, message: 'Invoice items validation failed.', error: "Validation Error", fieldErrors: { items: itemErrors } };
    }

  // Combine validated data
  const { clientId, issueDate, dueDate, status, notes } = basicValidation.data;

  try {
     const invoiceNumber = await getNextInvoiceNumber();

    const createdInvoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        clientId,
        issueDate,
        dueDate,
        status,
        notes,
        total: calculatedTotal, // Use calculated total
        items: {
          create: validatedItemsData.map(item => ({ // Use validated item data
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
          })),
        },
      },
       include: { items: true, client: true }, // Include relations in the response
    });

    revalidatePath('/invoices');
     revalidatePath(`/invoices/${createdInvoice.id}`); // Revalidate specific invoice page if exists
     revalidatePath('/dashboard'); // Revalidate dashboard for stats
    return { success: true, message: `Invoice ${createdInvoice.invoiceNumber} created.`, data: createdInvoice };
  } catch (error: unknown) {
    console.error("[DB_ERROR] Failed to create invoice:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
         // Foreign key constraint (e.g., invalid clientId)
         if (error.code === 'P2003' && (error.meta?.field_name as string)?.includes('clientId')) {
            return {
                success: false,
                message: 'Database Error: The selected client does not exist.',
                error: error.code,
                fieldErrors: { clientId: ['Invalid client selected.'] }
            };
         }
         // Unique constraint (e.g., invoiceNumber - less likely with generator but possible)
          if (error.code === 'P2002') {
             return { success: false, message: 'Database Error: Failed to generate unique invoice number.', error: error.code };
          }
     }
    return {
        success: false,
        message: 'Database Error: Failed to create invoice.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Add updateInvoice action similarly...

export async function deleteInvoice(id: string): Promise<ActionResult> {
  if (!id) {
     return { success: false, message: 'Invoice ID is required for deletion.' };
  }

  try {
     // Prisma will cascade delete items due to the schema definition `onDelete: Cascade`
     // First check if invoice exists
     const invoice = await prisma.invoice.findUnique({ where: { id: id }, select: { id: true } });
     if (!invoice) {
          return { success: false, message: 'Invoice not found. It may have already been deleted.', error: 'P2025' };
     }

     // Then delete
    await prisma.invoice.delete({
      where: { id },
    });

    revalidatePath('/invoices');
    revalidatePath('/dashboard');
    return { success: true, message: 'Invoice deleted successfully.' };
  } catch (error: unknown) {
     console.error("[DB_ERROR] Failed to delete invoice:", error);
     // Catching P2025 might be redundant due to the check above, but kept for safety
     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
         return { success: false, message: 'Invoice not found.', error: error.code };
     }
    return {
        success: false,
        message: 'Database Error: Failed to delete invoice.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Schema Definitions (Imported from lib/schemas/invoice) ---
// Already imported at the top
