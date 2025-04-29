
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { invoiceSchema, invoiceItemSchema, InvoiceSchema, invoiceFormSchema } from '@/lib/schemas/invoice';
import { clientSchema } from '@/lib/schemas/client';
import { Prisma } from '@prisma/client'; // Import Prisma as a value
import { accountSchema } from '@/lib/schemas/account';
import { getTenantId } from '@/lib/utils/tenant'; // Helper to get tenant ID

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};

// Helper function to check and log Prisma init errors (assumes it exists or copy from other files)
function checkPrismaInitError(error: unknown, context: string): boolean {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error(`[ACTION_ERROR] Prisma Initialization Error in ${context}:`, error.message);
         // Handle libssl error message specifically if needed
         return true;
     }
     return false;
}

// --- Invoice Number Generation (scoped per tenant) ---
async function getNextInvoiceNumber(tenantId: string): Promise<string> {
    const fallbackPrefix = `INV-${tenantId.substring(0, 4).toUpperCase()}-`;
    const fallbackNumber = `${fallbackPrefix}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    try {
      const lastInvoice = await prisma.invoice.findFirst({
        where: { tenantId: tenantId }, // Filter by tenant
        orderBy: { createdAt: 'desc' },
        select: { invoiceNumber: true },
      });

      const prefix = `INV-`; // Standard prefix, tenant uniqueness handled by tenantId filter

      if (!lastInvoice || !lastInvoice.invoiceNumber) {
        return `${prefix}0001`; // Start with 4 digits
      }

      // Extract number part, assuming format like INV-XXXX
      const match = lastInvoice.invoiceNumber.match(/INV-(\d+)/);
      let nextNum = 1;
      if (match && match[1]) {
        nextNum = parseInt(match[1], 10) + 1;
      } else {
          // Fallback if format is unexpected, count existing invoices for this tenant
          console.warn(`Unexpected invoice number format found for tenant ${tenantId}. Generating next based on count.`);
          const count = await prisma.invoice.count({ where: { tenantId: tenantId } });
          nextNum = count + 1;
      }
      return `${prefix}${String(nextNum).padStart(4, '0')}`; // Pad to 4 digits
  } catch (error) {
       if (checkPrismaInitError(error, `getNextInvoiceNumber (Tenant: ${tenantId})`)) {
            console.warn(`Returning fallback invoice number for tenant ${tenantId} due to DB connection issue.`);
            return fallbackNumber;
       }
      console.error(`[HELPER_ERROR] Failed to get next invoice number for tenant ${tenantId}:`, error);
      return fallbackNumber; // Return fallback on other errors
  }
}

// --- Get Invoices for the current tenant ---
export async function getInvoices(): Promise<InvoiceSchema[]> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    console.error("[ACTION_ERROR] Tenant ID not found in getInvoices.");
    return [];
  }

  try {
    const invoices = await prisma.invoice.findMany({
      where: { tenantId: tenantId }, // Filter by tenant
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
      if (checkPrismaInitError(error, `getInvoices (Tenant: ${tenantId})`)) {
           console.warn(`Returning empty invoices list for tenant ${tenantId} due to database connection failure.`);
     } else {
           console.error(`[ACTION_ERROR] Error fetching invoices for tenant ${tenantId}:`, error);
     }
       return [];
  }
}

// --- Get Invoice By ID (ensuring it belongs to the current tenant) ---
export async function getInvoiceById(id: string): Promise<InvoiceSchema | null> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    console.error("[ACTION_ERROR] Tenant ID not found in getInvoiceById.");
    return null;
  }

  if (!id) return null;
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id }, // ID is globally unique
       include: {
          client: true, // Fetch full client to parse later
          items: {
               include: {
                  taxRate: { select: { id: true, name: true, ratePercent: true } }
              }
          },
          // revenueAccount: { select: { id: true, name: true, code: true } }
        },
    });

     if (!invoice || invoice.tenantId !== tenantId) {
         // Not found or doesn't belong to the current tenant
         return null;
     }

     // Parse and return
     return invoiceSchema.parse({
        ...invoice,
        total: invoice.total.toNumber(),
        issueDate: new Date(invoice.issueDate),
        dueDate: new Date(invoice.dueDate),
        notes: invoice.notes ?? undefined,
        client: clientSchema.parse({ // Parse full client details after fetching
             ...invoice.client,
             email: invoice.client.email ?? undefined,
             address: invoice.client.address ?? undefined,
             phone: invoice.client.phone ?? undefined,
             paymentTerms: invoice.client.paymentTerms ?? undefined,
             balanceDue: invoice.client.balanceDue?.toNumber() ?? 0, // Handle Decimal
             createdAt: invoice.client.createdAt, // Ensure these are passed if needed by schema
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
       if (checkPrismaInitError(error, `getInvoiceById (${id}, Tenant: ${tenantId})`)) {
            console.warn(`Returning null for getInvoiceById(${id}, Tenant: ${tenantId}) due to database connection failure.`);
       } else {
           console.error(`[ACTION_ERROR] Error fetching invoice ${id} for tenant ${tenantId}:`, error);
       }
    return null;
  }
}

// --- Create Invoice for the current tenant ---
export async function createInvoice(formData: FormData): Promise<ActionResult> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return { success: false, message: 'Tenant ID not found. Cannot create invoice.' };
  }

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
        console.error(`[VALIDATION_ERROR] createInvoice (basic, Tenant: ${tenantId}):`, fieldErrors);
        return { success: false, message: 'Basic invoice validation failed.', error: "Validation Error", fieldErrors };
    }

    // Ensure the selected client belongs to the current tenant
    const selectedClientId = basicValidation.data.clientId;
    try {
        const client = await prisma.client.findUnique({ where: { id: selectedClientId }, select: { tenantId: true } });
        if (!client || client.tenantId !== tenantId) {
            return { success: false, message: "Invalid client selected for this tenant.", fieldErrors: { clientId: ["Invalid client selected."] } };
        }
        // Also validate revenueAccount if provided
        const selectedRevenueAccountId = basicValidation.data.revenueAccountId;
        if (selectedRevenueAccountId) {
             const account = await prisma.account.findUnique({ where: { id: selectedRevenueAccountId }, select: { tenantId: true, type: true } });
             if (!account || account.tenantId !== tenantId || account.type !== 'Revenue') {
                  return { success: false, message: "Invalid revenue account selected.", fieldErrors: { revenueAccountId: ["Invalid revenue account."] } };
             }
        }
    } catch (error) {
        console.error(`[DB_ERROR] Error validating client/account for tenant ${tenantId} during invoice creation:`, error);
        return { success: false, message: 'Database error during validation.' };
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
     console.error(`[VALIDATION_ERROR] createInvoice (items JSON, Tenant: ${tenantId}):`, error);
     return { success: false, message: 'Invalid invoice items data format.', error: "Validation Error", fieldErrors: { items: ['Invalid items format or missing items.'] } };
   }

   // TODO: Validate taxRateId belongs to the tenant if provided

   // Validate each item, calculate total, and prepare data for creation
   const validatedItemsData: Prisma.InvoiceItemCreateWithoutInvoiceInput[] = [];
   let calculatedTotal = 0;
   const itemErrors: string[] = [];

   for (let i = 0; i < parsedItems.length; i++) {
       const item = parsedItems[i];
       const itemValidation = invoiceItemSchema.pick({ description: true, quantity: true, unitPrice: true, taxRateId: true }).safeParse({
           description: item.description,
           quantity: parseInt(item.quantity, 10),
           unitPrice: parseFloat(item.unitPrice),
           taxRateId: item.taxRateId || undefined,
       });

       if (!itemValidation.success) {
           // ... (error handling as before)
           const errors = itemValidation.error.flatten().fieldErrors;
            Object.values(errors).flat().forEach(errMsg => itemErrors.push(`Item ${i+1}: ${errMsg}`));
       } else {
           const validItemData = itemValidation.data;
           const itemSubtotal = validItemData.quantity * validItemData.unitPrice;
           // TODO: Add tax calculation logic here if taxRateId is present and valid for the tenant
           const itemTotal = itemSubtotal; // Update with tax later
           validatedItemsData.push({
               description: validItemData.description,
               quantity: validItemData.quantity,
               unitPrice: validItemData.unitPrice,
               taxRateId: validItemData.taxRateId,
               total: itemTotal,
           });
            calculatedTotal += itemTotal;
       }
   }

    if (itemErrors.length > 0) {
        console.error(`[VALIDATION_ERROR] createInvoice (items, Tenant: ${tenantId}):`, itemErrors);
        return { success: false, message: 'Invoice items validation failed.', error: "Validation Error", fieldErrors: { items: itemErrors } };
    }

  // Combine validated data
  const { clientId, issueDate, dueDate, status, notes, revenueAccountId } = basicValidation.data;

  try {
     const invoiceNumber = await getNextInvoiceNumber(tenantId); // Pass tenantId

     // Create invoice and items within a transaction
     const createdInvoice = await prisma.invoice.create({
        data: {
            tenantId: tenantId, // Set tenant ID
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

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${createdInvoice.id}`);
    revalidatePath('/dashboard');
    return { success: true, message: `Invoice ${createdInvoice.invoiceNumber} created.`, data: createdInvoice };
  } catch (error: unknown) {
    if (checkPrismaInitError(error, `createInvoice (Tenant: ${tenantId})`)) {
        return { success: false, message: 'Database Connection Error. Failed to create invoice.', error: 'Initialization Error' };
    }
    console.error(`[DB_ERROR] Failed to create invoice for tenant ${tenantId}:`, error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
         // Foreign key constraint (e.g., invalid clientId, revenueAccountId - checked earlier but catch here too)
         if (error.code === 'P2003') {
             const fieldName = (error.meta?.field_name as string) || 'related record';
             let userMessage = `Database Error: Invalid ${fieldName}. Record not found.`;
            return { success: false, message: userMessage, error: error.code };
         }
          // Unique constraint (tenantId, invoiceNumber)
          if (error.code === 'P2002') {
             return { success: false, message: 'Database Error: Failed to generate unique invoice number. Please try again.', error: error.code };
          }
     }
    return { success: false, message: 'Database Error: Failed to create invoice.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Update Invoice ---
export async function updateInvoice(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
   const invoiceId = formData.get('id') as string;
   if (!invoiceId) return { success: false, message: "Invoice ID missing." };

    // 1. Verify invoice belongs to the tenant
    try {
        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { tenantId: true } });
        if (!invoice) return { success: false, message: 'Invoice not found.' };
        if (invoice.tenantId !== tenantId) return { success: false, message: 'Authorization Error.' };
    } catch (error) {
        // Handle DB error
        return { success: false, message: 'Database error verifying invoice ownership.' };
    }

   // 2. Perform validation similar to createInvoice (basic fields, items, client/account ownership)
   // ...

   // 3. Use a transaction to:
   //    a. Delete existing items for this invoice.
   //    b. Create new items based on validated form data.
   //    c. Update the invoice header data (client, dates, status, notes, *recalculated total*).
   //    d. Potentially update related Journal Entries.

  console.warn("Update Invoice - Not fully implemented yet (Requires Complex Transaction Logic)");
  return { success: false, message: 'Update Invoice - Not Implemented Yet' };
}

// --- Delete Invoice ---
export async function deleteInvoice(id: string): Promise<ActionResult> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return { success: false, message: 'Tenant ID not found.' };
  }
  if (!id) return { success: false, message: 'Invoice ID is required.' };

  try {
     // Check if invoice exists and belongs to the tenant
     const invoice = await prisma.invoice.findUnique({
          where: { id },
          select: { id: true, status: true, tenantId: true } // Include tenantId
        });

     if (!invoice) return { success: false, message: 'Invoice not found.', error: 'P2025' };
     if (invoice.tenantId !== tenantId) return { success: false, message: 'Authorization Error.' };


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
    if (checkPrismaInitError(error, `deleteInvoice (${id}, Tenant: ${tenantId})`)) {
        return { success: false, message: 'Database Connection Error. Failed to delete invoice.', error: 'Initialization Error' };
    }
     console.error(`[DB_ERROR] Failed to delete invoice ${id} for tenant ${tenantId}:`, error);
     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
         return { success: false, message: 'Invoice not found.', error: error.code };
     }
    return { success: false, message: 'Database Error: Failed to delete invoice.', error: error instanceof Error ? error.message : String(error) };
  }
}
