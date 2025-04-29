
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { invoiceSchema, invoiceItemSchema, clientSchema, InvoiceSchema } from '@/lib/schemas/invoice';

// Type definition for action results
type ActionResult = { success: boolean; message: string; data?: any; error?: unknown };

// --- Client Actions ---

export async function getClients(): Promise<ClientSchema[]> {
  try {
    const clients = await prisma.client.findMany({ orderBy: { name: 'asc' } });
    return clients.map(client => clientSchema.parse(client));
  } catch (error) {
    console.error("Error fetching clients:", error);
    return [];
  }
}

export async function addClient(formData: FormData): Promise<ActionResult> {
  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = clientSchema.omit({ id: true }).safeParse(rawData); // Omit ID for creation

  if (!validatedFields.success) {
     console.error("Client Validation Failed:", validatedFields.error.flatten().fieldErrors);
    return { success: false, message: 'Validation failed.', error: validatedFields.error.flatten().fieldErrors };
  }

  try {
    const client = await prisma.client.create({ data: validatedFields.data });
    revalidatePath('/invoices'); // Or relevant client page
    return { success: true, message: `Client "${client.name}" created.`, data: client };
  } catch (error: any) {
    console.error("Error creating client:", error);
     if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        return { success: false, message: 'Client email already exists.' };
     }
    return { success: false, message: 'Database Error: Failed to create client.', error };
  }
}

// --- Invoice Actions ---

// Helper to generate the next invoice number
async function getNextInvoiceNumber(): Promise<string> {
  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });

  if (!lastInvoice || !lastInvoice.invoiceNumber) {
    return 'INV-001';
  }

  const match = lastInvoice.invoiceNumber.match(/INV-(\d+)/);
  if (match && match[1]) {
    const nextNum = parseInt(match[1], 10) + 1;
    return `INV-${String(nextNum).padStart(3, '0')}`;
  }

  // Fallback if format is unexpected
  return `INV-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
}

export async function getInvoices(): Promise<InvoiceSchema[]> {
  try {
    const invoices = await prisma.invoice.findMany({
      include: { client: true, items: true }, // Include related data
      orderBy: { issueDate: 'desc' },
    });

     // Parse and potentially transform data before returning
     return invoices.map(inv => invoiceSchema.parse({
         ...inv,
         // Ensure dates are Dates if needed, Prisma returns DateTime objects
         issueDate: new Date(inv.issueDate),
         dueDate: new Date(inv.dueDate),
         // Optionally parse client and items if schema requires full objects
         client: clientSchema.parse(inv.client),
         items: inv.items.map(item => invoiceItemSchema.parse(item)),
     }));

  } catch (error) {
    console.error("Error fetching invoices:", error);
    return [];
  }
}

export async function getInvoiceById(id: string): Promise<InvoiceSchema | null> {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { client: true, items: true },
    });
     if (!invoice) return null;

     // Parse and return
     return invoiceSchema.parse({
        ...invoice,
        issueDate: new Date(invoice.issueDate),
        dueDate: new Date(invoice.dueDate),
        client: clientSchema.parse(invoice.client),
        items: invoice.items.map(item => invoiceItemSchema.parse(item)),
     });
  } catch (error) {
     console.error(`Error fetching invoice ${id}:`, error);
    return null;
  }
}


export async function createInvoice(formData: FormData): Promise<ActionResult> {
   // Extract and parse items from formData (assuming they are sent as JSON string)
   const itemsJson = formData.get('items') as string;
   let itemsData: any[];
   try {
     itemsData = JSON.parse(itemsJson);
     // Validate each item
     itemsData.forEach(item => invoiceItemSchema.omit({ id: true, invoiceId: true }).parse(item));
   } catch (error) {
     console.error("Error parsing or validating invoice items:", error);
     return { success: false, message: 'Invalid invoice items data.', error };
   }

  // Calculate total from validated items
   const total = itemsData.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0);

  const validatedFields = invoiceSchema.omit({ id: true, invoiceNumber: true, createdAt: true, updatedAt: true, items: true, client: true, total: true }).safeParse({
    clientId: formData.get('clientId'),
    issueDate: new Date(formData.get('issueDate') as string),
    dueDate: new Date(formData.get('dueDate') as string),
    status: formData.get('status') || 'Draft', // Default to Draft if not provided
    notes: formData.get('notes') || null,
  });

  if (!validatedFields.success) {
     console.error("Invoice Validation Failed:", validatedFields.error.flatten().fieldErrors);
    return { success: false, message: 'Validation failed.', error: validatedFields.error.flatten().fieldErrors };
  }

  const { clientId, issueDate, dueDate, status, notes } = validatedFields.data;

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
        total: total, // Store calculated total
        items: {
          create: itemsData.map(item => ({
            description: item.description,
            quantity: parseInt(item.quantity, 10),
            unitPrice: parseFloat(item.unitPrice),
            total: parseFloat(item.quantity) * parseFloat(item.unitPrice),
          })),
        },
      },
       include: { items: true, client: true }, // Include relations in the response
    });

    revalidatePath('/invoices');
     revalidatePath(`/invoices/${createdInvoice.id}`); // Revalidate specific invoice page if exists
     revalidatePath('/dashboard'); // Revalidate dashboard for stats
    return { success: true, message: `Invoice ${createdInvoice.invoiceNumber} created.`, data: createdInvoice };
  } catch (error) {
    console.error("Error creating invoice:", error);
    return { success: false, message: 'Database Error: Failed to create invoice.', error };
  }
}

// Add updateInvoice and deleteInvoice actions similarly...
// Remember to handle item updates/deletions within updateInvoice.
// For deleteInvoice, consider cascading deletes defined in the schema or manual deletion of items first.

export async function deleteInvoice(id: string): Promise<ActionResult> {
  if (!id) {
     return { success: false, message: 'Invoice ID is required for deletion.' };
  }

  try {
     // Prisma will cascade delete items due to the schema definition `onDelete: Cascade`
    await prisma.invoice.delete({
      where: { id },
    });

    revalidatePath('/invoices');
    revalidatePath('/dashboard');
    return { success: true, message: 'Invoice deleted successfully.' };
  } catch (error) {
     console.error("Error deleting invoice:", error);
     if ((error as any).code === 'P2025') {
         return { success: false, message: 'Invoice not found.' };
     }
    return { success: false, message: 'Database Error: Failed to delete invoice.', error };
  }
}

// --- Schema Definitions (Imported from lib/schemas/invoice) ---
import type { ClientSchema, InvoiceItemSchema } from '@/lib/schemas/invoice';


