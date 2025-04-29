
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { invoiceSchema, invoiceItemSchema, InvoiceSchema, invoiceFormSchema } from '@/lib/schemas/invoice';
import { clientSchema } from '@/lib/schemas/client'; // Ensure client schema is correctly imported
import type { Prisma } from '@prisma/client'; // Import Prisma types
import { accountSchema } from '@/lib/schemas/account'; // Import for parsing relations

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};

// Centralized flag to track if a critical init error occurred
let prismaInitializationFailed = false;
let libsslErrorLogged = false; // Flag to log libssl error only once per request cycle

// Helper function to check and log Prisma init errors
function checkPrismaInitError(error: unknown, context: string): boolean {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         prismaInitializationFailed = true; // Set the flag
         console.error(`[ACTION_ERROR] Prisma Initialization Error in ${context}:`, error.message);
         if (error.message.includes('libssl') && !libsslErrorLogged) {
             console.error("DATABASE CONNECTION FAILED: Prisma cannot find the required `libssl` system library (e.g., libssl.so.1.1). This is an ENVIRONMENT ISSUE. Please ensure OpenSSL 1.1 is installed and accessible in your deployment environment.");
             libsslErrorLogged = true; // Prevent repeated logging
         } else if (!error.message.includes('libssl')) {
             console.error(`DATABASE CONNECTION FAILED (${context}): Prisma failed to initialize. Check database connection details and server logs.`);
         }
         return true; // Indicate an init error occurred
     }
     return false; // Not an init error
}

// --- Invoice Actions ---

// Helper to generate the next invoice number
async function getNextInvoiceNumber(): Promise<string> {
    const fallbackNumber = `INV-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
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
      console.warn("Unexpected invoice number format found. Generating fallback.");
      const count = await prisma.invoice.count();
      return `INV-${String(count + 1).padStart(4, '0')}`;
  } catch (error) {
       if (checkPrismaInitError(error, 'getNextInvoiceNumber')) {
            console.warn("Returning fallback invoice number due to database connection failure.");
            return fallbackNumber;
       }
      console.error("[HELPER_ERROR] Failed to get next invoice number:", error);
      return fallbackNumber;
  }
}

// --- Get Invoices ---
export async function getInvoices(): Promise<InvoiceSchema[]> {
  // Reset flags for this request
  prismaInitializationFailed = false;
  libsslErrorLogged = false;

  try {
    const invoices = await prisma.invoice.findMany({
      include: {
          client: { select: { id: true, name: true } }, // Select only needed client fields
          items: { // Include items with optional tax rate info
              include: {
                  taxRate: { select: { id: true, name: true, ratePercent: true } }
              }
          },
          // revenueAccount: { select: { id: true, name: true, code: true } } // Optional: Include revenue account info
        },
      orderBy: { issueDate: 'desc' },
    });

     // Parse and potentially transform data before returning
     return invoices.map(inv => invoiceSchema.parse({
         ...inv,
         total: inv.total.toNumber(), // Convert Decimal
         issueDate: new Date(inv.issueDate),
         dueDate: new Date(inv.dueDate),
         notes: inv.notes ?? undefined,
         client: inv.client ? clientSchema.pick({ id: true, name: true }).parse(inv.client) : undefined,
         items: inv.items.map(item => invoiceItemSchema.parse({
             ...item,
             unitPrice: item.unitPrice.toNumber(),
             total: item.total.toNumber(),
             // taxRate: item.taxRate ? taxRateSchema.parse({...item.taxRate, ratePercent: item.taxRate.ratePercent.toNumber()}) : undefined, // Parse tax rate if included
             taxRateId: item.taxRateId ?? undefined,
         })),
         revenueAccountId: inv.revenueAccountId ?? undefined,
         // revenueAccount: inv.revenueAccount ? accountSchema.parse(inv.revenueAccount) : undefined,
     }));

  } catch (error) {
      if (checkPrismaInitError(error, 'getInvoices')) {
           console.warn("Returning empty invoices list due to database connection failure.");
       } else {
           console.error("[ACTION_ERROR] Error fetching invoices:", error);
       }
       return [];
  }
}

// --- Get Invoice By ID ---
export async function getInvoiceById(id: string): Promise<InvoiceSchema | null> {
  // Reset flags for this request
  prismaInitializationFailed = false;
  libsslErrorLogged = false;

  if (!id) return null;
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
       include: {
          client: { select: { id: true, name: true, email: true, address: true, phone: true, paymentTerms: true, balanceDue: true, createdAt: true, updatedAt: true } }, // Fetch all needed client fields
          items: {
               include: {
                  taxRate: { select: { id: true, name: true, ratePercent: true } }
              }
          },
          // revenueAccount: { select: { id: true, name: true, code: true } }
        },
    });
     if (!invoice) return null;

     // Parse and return
     return invoiceSchema.parse({
        ...invoice,
        total: invoice.total.toNumber(),
        issueDate: new Date(invoice.issueDate),
        dueDate: new Date(invoice.dueDate),
        notes: invoice.notes ?? undefined,
        client: clientSchema.parse({ // Parse full client details
             ...invoice.client,
             email: invoice.client.email ?? undefined,
             address: invoice.client.address ?? undefined,
             phone: invoice.client.phone ?? undefined,
             paymentTerms: invoice.client.paymentTerms ?? undefined,
             balanceDue: invoice.client.balanceDue?.toNumber() ?? 0, // Handle Decimal
             createdAt: invoice.client.createdAt,
             updatedAt: invoice.client.updatedAt,
        }),
        items: invoice.items.map(item => invoiceItemSchema.parse({
            ...item,
            unitPrice: item.unitPrice.toNumber(),
            total: item.total.toNumber(),
            taxRateId: item.taxRateId ?? undefined,
            // taxRate: item.taxRate ? taxRateSchema.parse({...item.taxRate, ratePercent: item.taxRate.ratePercent.toNumber()}) : undefined,
        })),
         revenueAccountId: invoice.revenueAccountId ?? undefined,
         // revenueAccount: inv.revenueAccount ? accountSchema.parse(inv.revenueAccount) : undefined,
     });
  } catch (error) {
       if (checkPrismaInitError(error, `getInvoiceById (${id})`)) {
            console.warn(`Returning null for getInvoiceById(${id}) due to database connection failure.`);
       } else {
           console.error(`[ACTION_ERROR] Error fetching invoice ${id}:`, error);
       }
    return null;
  }
}

// --- Create Invoice ---
export async function createInvoice(formData: FormData): Promise<ActionResult> {
  // Reset flags for this request
  prismaInitializationFailed = false;
  libsslErrorLogged = false;

   // 1. Validate basic invoice fields
   const basicInvoiceData = {
        clientId: formData.get('clientId'),
        issueDate: formData.get('issueDate'),
        dueDate: formData.get('dueDate'),
        status: formData.get('status') || 'Draft',
        notes: formData.get('notes'),
        revenueAccountId: formData.get('revenueAccountId'),
    };

   // Use the specific form schema for validation
   const basicValidation = invoiceFormSchema.omit({ items: true }).safeParse({
        ...basicInvoiceData,
        issueDate: basicInvoiceData.issueDate ? new Date(basicInvoiceData.issueDate as string) : undefined,
        dueDate: basicInvoiceData.dueDate ? new Date(basicInvoiceData.dueDate as string) : undefined,
        notes: basicInvoiceData.notes || undefined, // map empty to undefined
        revenueAccountId: basicInvoiceData.revenueAccountId || undefined,
   });

    if (!basicValidation.success) {
        const fieldErrors = basicValidation.error.flatten().fieldErrors;
        console.error("[VALIDATION_ERROR] createInvoice (basic):", fieldErrors);
        return { success: false, message: 'Basic invoice validation failed.', error: "Validation Error", fieldErrors };
    }

    // 2. Parse and validate items from JSON string
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

   // Fetch Tax Rates needed for calculation (optional, could be passed or fetched once)
   // const taxRatesMap = await getTaxRatesMap(); // Helper to fetch tax rates by ID

   // Validate each item, calculate total, and prepare data for creation
   const validatedItemsData: Prisma.InvoiceItemCreateWithoutInvoiceInput[] = [];
   let calculatedTotal = 0;
   const itemErrors: string[] = [];

   for (let i = 0; i < parsedItems.length; i++) {
       const item = parsedItems[i];
        // Validate using a schema subset for item creation data
       const itemValidation = invoiceItemSchema.pick({ description: true, quantity: true, unitPrice: true, taxRateId: true }).safeParse({
           description: item.description,
           quantity: parseInt(item.quantity, 10),
           unitPrice: parseFloat(item.unitPrice),
           taxRateId: item.taxRateId || undefined, // Handle optional tax rate
       });

       if (!itemValidation.success) {
            const errors = itemValidation.error.flatten().fieldErrors;
            Object.values(errors).flat().forEach(errMsg => itemErrors.push(`Item ${i+1}: ${errMsg}`));
       } else {
           const validItemData = itemValidation.data;
           const itemSubtotal = validItemData.quantity * validItemData.unitPrice;
           let itemTax = 0;
           // TODO: Calculate tax based on taxRateId if provided and tax rates fetched
           // if (validItemData.taxRateId && taxRatesMap[validItemData.taxRateId]) {
           //     itemTax = itemSubtotal * (taxRatesMap[validItemData.taxRateId] / 100);
           // }
           const itemTotal = itemSubtotal + itemTax; // Add tax to item total

           validatedItemsData.push({
               description: validItemData.description,
               quantity: validItemData.quantity,
               unitPrice: validItemData.unitPrice,
               taxRateId: validItemData.taxRateId,
               total: itemTotal, // Store calculated total including tax
           });
            calculatedTotal += itemTotal; // Add item total to invoice total
       }
   }

    if (itemErrors.length > 0) {
        console.error("[VALIDATION_ERROR] createInvoice (items validation):", itemErrors);
        return { success: false, message: 'Invoice items validation failed.', error: "Validation Error", fieldErrors: { items: itemErrors } };
    }

  // Combine validated data
  const { clientId, issueDate, dueDate, status, notes, revenueAccountId } = basicValidation.data;

  try {
     const invoiceNumber = await getNextInvoiceNumber();

     // Create invoice and items within a transaction
     const createdInvoice = await prisma.invoice.create({
        data: {
            invoiceNumber,
            clientId,
            issueDate,
            dueDate,
            status,
            notes,
            total: calculatedTotal, // Use calculated total
            revenueAccountId,
            items: {
                create: validatedItemsData, // Use validated item data
            },
        },
        include: { items: true, client: true }, // Include relations in the response
     });

      // TODO: Optional - Create corresponding Journal Entry if status is not Draft
      // if (status !== 'Draft') {
      //    await createJournalEntryForInvoice(createdInvoice); // Implement this helper
      // }

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${createdInvoice.id}`);
    revalidatePath('/dashboard');
    return { success: true, message: `Invoice ${createdInvoice.invoiceNumber} created.`, data: createdInvoice };
  } catch (error: unknown) {
    if (checkPrismaInitError(error, 'createInvoice')) {
        return { success: false, message: 'Database Connection Error. Failed to create invoice.', error: 'Initialization Error' };
    }
    console.error("[DB_ERROR] Failed to create invoice:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
         // Foreign key constraint (e.g., invalid clientId, revenueAccountId)
         if (error.code === 'P2003') {
             const fieldName = (error.meta?.field_name as string) || 'related record';
             let userMessage = `Database Error: Invalid ${fieldName}. Record not found.`;
             let fieldKey: keyof InvoiceFormSchema | undefined;
             if (fieldName.includes('clientId')) { userMessage = 'Invalid client selected.'; fieldKey = 'clientId'; }
             if (fieldName.includes('revenueAccountId')) { userMessage = 'Invalid revenue account selected.'; fieldKey = 'revenueAccountId'; }
            return { success: false, message: userMessage, error: error.code, fieldErrors: fieldKey ? { [fieldKey]: [userMessage] } : undefined };
         }
          if (error.code === 'P2002') { // Unique constraint (invoiceNumber)
             return { success: false, message: 'Database Error: Failed to generate unique invoice number. Please try again.', error: error.code };
          }
     }
    return { success: false, message: 'Database Error: Failed to create invoice.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Update Invoice ---
export async function updateInvoice(formData: FormData): Promise<ActionResult> {
  // Placeholder: Complex logic involving updating items (delete old, create new), recalculating total, potentially updating journal entries.
   console.log("Update invoice action called (Not Implemented)", Object.fromEntries(formData.entries()));
   const invoiceId = formData.get('id') as string;
   if (!invoiceId) return { success: false, message: "Invoice ID missing." };
   // Validation, Transaction logic for update, Revalidation...
  return { success: false, message: 'Update Invoice - Not Implemented Yet (Requires Complex Transaction Logic)' };
}

// --- Delete Invoice ---
export async function deleteInvoice(id: string): Promise<ActionResult> {
  // Reset flags for this request
  prismaInitializationFailed = false;
  libsslErrorLogged = false;

  if (!id) return { success: false, message: 'Invoice ID is required.' };

  try {
     // Check if invoice exists
     const invoice = await prisma.invoice.findUnique({
          where: { id },
          select: { id: true, status: true } // Check status if needed (e.g., prevent deleting Paid invoices)
        });
     if (!invoice) return { success: false, message: 'Invoice not found.', error: 'P2025' };

     // TODO: Add business logic checks (e.g., cannot delete if payments exist?)
     // const paymentsCount = await prisma.payment.count({ where: { invoiceId: id } });
     // if (paymentsCount > 0) return { success: false, message: "Cannot delete invoice with recorded payments."};

     // TODO: Consider deleting related Journal Entry if one was created

     // Prisma will cascade delete items due to schema definition
     await prisma.invoice.delete({ where: { id } });

    revalidatePath('/invoices');
    revalidatePath('/dashboard');
    return { success: true, message: 'Invoice deleted successfully.' };
  } catch (error: unknown) {
    if (checkPrismaInitError(error, 'deleteInvoice')) {
        return { success: false, message: 'Database Connection Error. Failed to delete invoice.', error: 'Initialization Error' };
    }
     console.error("[DB_ERROR] Failed to delete invoice:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
         return { success: false, message: 'Invoice not found.', error: error.code };
     }
    return { success: false, message: 'Database Error: Failed to delete invoice.', error: error instanceof Error ? error.message : String(error) };
  }
}
