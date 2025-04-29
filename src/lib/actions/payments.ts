
'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { paymentSchema, paymentFormSchema, PaymentSchema } from '@/lib/schemas/payment';
import { Prisma } from '@prisma/client';

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

// --- Get Payments ---
export async function getPayments(): Promise<PaymentSchema[]> {
  // Reset flags for this request
  prismaInitializationFailed = false;
  libsslErrorLogged = false;

  try {
    const payments = await prisma.payment.findMany({
        orderBy: { paymentDate: 'desc' },
        include: {
            bankAccount: { select: { id: true, name: true } },
            invoice: { select: { id: true, invoiceNumber: true } },
            expense: { select: { id: true, description: true, amount: true } } // Include minimal expense info
        }
    });
    // Validate each payment against the schema before returning
    // Note: This requires paymentSchema to potentially include optional nested schemas
    // or adjust parsing based on included fields. For simplicity, we might skip deep validation here
    // if the included structure is complex/variable.
    // Basic validation example:
    return payments.map(p => ({
        ...p,
        paymentDate: new Date(p.paymentDate),
        amount: p.amount.toNumber(), // Convert Decimal to number if needed by schema/UI
    }));
    // return payments as PaymentSchema[]; // Cast if validation is too complex for now
  } catch (error) {
    if (checkPrismaInitError(error, 'getPayments')) {
        console.warn("Returning empty payments list due to database connection failure.");
    } else {
        console.error("[ACTION_ERROR] Error fetching payments:", error);
    }
    return [];
  }
}

// --- Add Payment ---
export async function addPayment(formData: FormData): Promise<ActionResult> {
  // Reset flags for this request
  prismaInitializationFailed = false;
  libsslErrorLogged = false;

  const rawData = Object.fromEntries(formData.entries());

  // TODO: Add logic to determine if payment is for invoice or expense if needed

  const validatedFields = paymentFormSchema.safeParse({
    paymentDate: rawData.paymentDate ? new Date(rawData.paymentDate as string) : undefined,
    amount: rawData.amount ? parseFloat(rawData.amount as string) : undefined,
    paymentMethod: rawData.paymentMethod,
    reference: rawData.reference || undefined,
    notes: rawData.notes || undefined,
    bankAccountId: rawData.bankAccountId,
    invoiceId: rawData.invoiceId || undefined,
    expenseId: rawData.expenseId || undefined,
  });

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    console.error("[VALIDATION_ERROR] addPayment:", fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  const { invoiceId, expenseId, amount, ...paymentData } = validatedFields.data;

  // --- Transaction Logic ---
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the payment record
      const newPayment = await tx.payment.create({
        data: {
          ...paymentData,
          amount,
          invoiceId: invoiceId,
          expenseId: expenseId,
        },
      });

      // 2. Update related Invoice status and balanceDue (if applicable)
      if (invoiceId) {
        const invoice = await tx.invoice.findUnique({
          where: { id: invoiceId },
          select: { total: true, payments: { select: { amount: true } } },
        });
        if (!invoice) throw new Error(`Invoice ${invoiceId} not found during transaction.`);

        const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount.toNumber(), 0) + amount;
        const balanceDue = invoice.total.toNumber() - totalPaid;
        const newStatus = balanceDue <= 0 ? Prisma.InvoiceStatus.Paid : Prisma.InvoiceStatus.Partial;

        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status: newStatus /* TODO: Update client balanceDue? */ },
        });
      }

      // 3. Update related Expense status (if applicable)
      if (expenseId) {
        await tx.expense.update({
            where: { id: expenseId },
            data: { status: Prisma.ExpenseStatus.Paid /* TODO: Update vendor balanceOwed? */ },
        });
      }

      // 4. Update Bank Account balance
      // Assuming payment DECREASES bank balance (payment made)
      // If it's payment RECEIVED, it INCREASES balance. Adjust logic accordingly.
      await tx.bankAccount.update({
        where: { id: paymentData.bankAccountId },
        data: { balance: { decrement: amount } }, // Use increment if payment received
      });

      return newPayment;
    });

    // Revalidate relevant paths
    revalidatePath('/payments');
    if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
    if (expenseId) revalidatePath(`/expenses/${expenseId}`);
    revalidatePath('/dashboard'); // Update stats potentially
    revalidatePath('/bank-accounts'); // Update bank balance list

    return { success: true, message: 'Payment recorded successfully.', data: result };

  } catch (error: unknown) {
     if (checkPrismaInitError(error, 'addPayment Transaction')) {
        return { success: false, message: 'Database Connection Error. Failed to record payment.', error: 'Initialization Error' };
     }

     console.error("[DB_ERROR] Failed to record payment transaction:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Handle specific errors like invalid foreign keys (bankAccountId, invoiceId, expenseId)
        if (error.code === 'P2003') {
            const field = (error.meta?.field_name as string) || 'related record';
            return { success: false, message: `Database Error: Invalid ${field}. Record not found.`, error: error.code };
        }
        if (error.code === 'P2025') { // Record to update not found (e.g., bank account)
             return { success: false, message: 'Database Error: Could not find related record to update.', error: error.code };
        }
     } else if (error instanceof Error && error.message.includes("not found during transaction")) {
         // Custom error from transaction check
         return { success: false, message: error.message, error: "Transaction Error" };
     }
    return {
        success: false,
        message: 'Database Error: Failed to record payment.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Update Payment ---
export async function updatePayment(formData: FormData): Promise<ActionResult> {
  // Placeholder: Requires careful handling of transaction rollbacks/recalculations
  console.log("Update payment action called (Not Implemented)", Object.fromEntries(formData.entries()));
   const paymentId = formData.get('id') as string;
   if (!paymentId) return { success: false, message: "Payment ID missing." };
   // Validation, Prisma update within transaction, revalidation...
  return { success: false, message: 'Update Payment - Not Implemented Yet (Requires Complex Transaction Logic)' };
}

// --- Delete Payment ---
export async function deletePayment(id: string): Promise<ActionResult> {
  // Placeholder: Requires careful transaction logic to revert updates
  console.log("Delete payment action called (Not Implemented)", id);
  if (!id) return { success: false, message: "Payment ID missing." };
   // Find payment, revert invoice/expense/bank updates in transaction, delete payment, revalidate...
  return { success: false, message: 'Delete Payment - Not Implemented Yet (Requires Complex Transaction Logic)' };
}
