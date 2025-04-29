
'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { paymentSchema, paymentFormSchema, PaymentSchema } from '@/lib/schemas/payment';
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

// Helper function to check and log Prisma init errors (assume it exists)
function checkPrismaInitError(error: unknown, context: string): boolean {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error(`[ACTION_ERROR] Prisma Initialization Error in ${context}:`, error.message);
         // Handle libssl error message specifically if needed
         return true;
     }
     return false;
}

// --- Get Payments for the current tenant ---
export async function getPayments(): Promise<PaymentSchema[]> {
  const tenantId = await getTenantId();
  if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getPayments.");
      return [];
  }

  try {
    const payments = await prisma.payment.findMany({
        where: { tenantId: tenantId }, // Filter by tenant
        orderBy: { paymentDate: 'desc' },
        include: {
            bankAccount: { select: { id: true, name: true } },
            invoice: { select: { id: true, invoiceNumber: true } },
            expense: { select: { id: true, description: true, amount: true } } // Include minimal expense info
        }
    });
    // Basic parsing, consider full schema validation if needed
    return payments.map(p => ({
        ...p,
        paymentDate: new Date(p.paymentDate),
        amount: p.amount.toNumber(), // Convert Decimal to number
        // Ensure nested objects conform to expected types if not using full schema validation
        bankAccount: p.bankAccount,
        invoice: p.invoice,
        expense: p.expense ? { ...p.expense, amount: p.expense.amount.toNumber() } : null,
    }));
  } catch (error) {
    if (checkPrismaInitError(error, `getPayments (Tenant: ${tenantId})`)) {
        console.warn(`Returning empty payments list for tenant ${tenantId} due to DB connection issue.`);
    } else {
        console.error(`[ACTION_ERROR] Error fetching payments for tenant ${tenantId}:`, error);
    }
    return [];
  }
}

// --- Add Payment for the current tenant ---
export async function addPayment(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot record payment.' };
   }

  const rawData = Object.fromEntries(formData.entries());

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
    console.error(`[VALIDATION_ERROR] addPayment (Tenant: ${tenantId}):`, fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  const { invoiceId, expenseId, amount, bankAccountId, ...paymentData } = validatedFields.data;

   // Validate that related entities (BankAccount, Invoice/Expense) belong to the tenant
   try {
        const bankAccount = await prisma.bankAccount.findUnique({ where: { id: bankAccountId }, select: { tenantId: true } });
        if (!bankAccount || bankAccount.tenantId !== tenantId) {
             return { success: false, message: 'Invalid bank account selected.', fieldErrors: { bankAccountId: ['Invalid bank account.'] } };
        }
        if (invoiceId) {
             const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { tenantId: true } });
             if (!invoice || invoice.tenantId !== tenantId) {
                  return { success: false, message: 'Invalid invoice selected.', fieldErrors: { invoiceId: ['Invalid invoice.'] } };
             }
        }
        if (expenseId) {
             const expense = await prisma.expense.findUnique({ where: { id: expenseId }, select: { tenantId: true } });
             if (!expense || expense.tenantId !== tenantId) {
                  return { success: false, message: 'Invalid expense selected.', fieldErrors: { expenseId: ['Invalid expense.'] } };
             }
        }
         if (invoiceId && expenseId) {
             return { success: false, message: 'Payment cannot be linked to both an invoice and an expense.' };
         }
         if (!invoiceId && !expenseId) {
            // Allow payments not linked to invoice/expense? Or require one? Adjust based on needs.
            // return { success: false, message: 'Payment must be linked to an invoice or an expense.' };
         }
   } catch (error) {
       console.error(`[DB_ERROR] Error validating relations for tenant ${tenantId} during payment creation:`, error);
       return { success: false, message: 'Database error during validation.' };
   }

  // --- Transaction Logic ---
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the payment record
      const newPayment = await tx.payment.create({
        data: {
          ...paymentData,
          tenantId: tenantId, // Set tenant ID
          amount,
          bankAccountId,
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

        // Correctly sum existing payments + new payment
        const existingPaymentsSum = invoice.payments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
        const totalPaid = existingPaymentsSum + amount; // Use the current payment amount
        const balanceDue = invoice.total.toNumber() - totalPaid;
        const newStatus = balanceDue <= 0.005 ? Prisma.InvoiceStatus.Paid : Prisma.InvoiceStatus.Partial; // Tolerance for float issues

        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status: newStatus /* TODO: Update client balanceDue? */ },
        });
      }

      // 3. Update related Expense status (if applicable)
      if (expenseId) {
        // Check if total payments cover expense amount
        const expense = await tx.expense.findUnique({ where: { id: expenseId }, select: { amount: true, payments: { select: { amount: true } } } });
        if (!expense) throw new Error(`Expense ${expenseId} not found during transaction.`);

        const existingPaymentsSum = expense.payments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
        const totalPaid = existingPaymentsSum + amount;
        const newStatus = totalPaid >= expense.amount.toNumber() ? Prisma.ExpenseStatus.Paid : Prisma.ExpenseStatus.Pending; // Or a Partial status if needed

        await tx.expense.update({
            where: { id: expenseId },
            data: { status: newStatus /* TODO: Update vendor balanceOwed? */ },
        });
      }

      // 4. Update Bank Account balance
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { balance: { decrement: amount } }, // Assuming payment made DECREASES balance
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
     if (checkPrismaInitError(error, `addPayment Transaction (Tenant: ${tenantId})`)) {
        return { success: false, message: 'Database Connection Error. Failed to record payment.', error: 'Initialization Error' };
     }

     console.error(`[DB_ERROR] Failed to record payment transaction for tenant ${tenantId}:`, error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
            const field = (error.meta?.field_name as string) || 'related record';
            return { success: false, message: `Database Error: Invalid ${field}. Record not found.`, error: error.code };
        }
        if (error.code === 'P2025') {
             return { success: false, message: 'Database Error: Could not find related record to update.', error: error.code };
        }
     } else if (error instanceof Error && error.message.includes("not found during transaction")) {
         return { success: false, message: error.message, error: "Transaction Error" };
     }
    return {
        success: false,
        message: 'Database Error: Failed to record payment.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Update Payment for the current tenant ---
export async function updatePayment(formData: FormData): Promise<ActionResult> {
    const tenantId = await getTenantId();
    if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
    const paymentId = formData.get('id') as string;
    if (!paymentId) return { success: false, message: "Payment ID missing." };

    // 1. Verify payment belongs to the tenant
    try {
        const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { tenantId: true } });
        if (!payment) return { success: false, message: 'Payment not found.' };
        if (payment.tenantId !== tenantId) return { success: false, message: 'Authorization Error.' };
    } catch (error) {
        // Handle DB error
        return { success: false, message: 'Database error verifying payment ownership.' };
    }

   // TODO: Implement complex update logic
   // - Validate form data and relations (like in addPayment)
   // - Use a transaction:
   //   - Find the *old* payment details (amount, invoiceId, expenseId, bankAccountId).
   //   - Revert the balance/status changes made by the *old* payment (decrement bank balance, update invoice/expense status).
   //   - Apply the changes for the *new* payment details (increment bank balance, update invoice/expense status based on new amount/links).
   //   - Update the payment record itself.
   console.warn("Update Payment - Not fully implemented yet (Requires Complex Transaction Logic)");
  return { success: false, message: 'Update Payment - Not Implemented Yet' };
}

// --- Delete Payment for the current tenant ---
export async function deletePayment(id: string): Promise<ActionResult> {
    const tenantId = await getTenantId();
    if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
    if (!id) return { success: false, message: "Payment ID missing." };

    // --- Transaction Logic ---
    try {
         const result = await prisma.$transaction(async (tx) => {
             // 1. Find the payment and verify ownership
             const payment = await tx.payment.findUnique({
                 where: { id },
                 select: { tenantId: true, amount: true, invoiceId: true, expenseId: true, bankAccountId: true }
             });
             if (!payment) throw new Error('Payment not found.');
             if (payment.tenantId !== tenantId) throw new Error('Authorization Error: Cannot delete this payment.');

             const amount = payment.amount.toNumber();

             // 2. Revert Bank Account balance change
             await tx.bankAccount.update({
                 where: { id: payment.bankAccountId },
                 data: { balance: { increment: amount } } // Increment because we are deleting a payment made
             });

             // 3. Revert Invoice status/balance change (if applicable)
             if (payment.invoiceId) {
                 const invoice = await tx.invoice.findUnique({
                     where: { id: payment.invoiceId },
                     select: { total: true, payments: { select: { id: true, amount: true } } }
                 });
                 if (invoice) { // Check if invoice still exists
                     const otherPaymentsSum = invoice.payments
                         .filter(p => p.id !== id) // Exclude the payment being deleted
                         .reduce((sum, p) => sum + p.amount.toNumber(), 0);
                     const balanceDueAfterDeletion = invoice.total.toNumber() - otherPaymentsSum;
                     const newStatus = balanceDueAfterDeletion <= 0.005 ? Prisma.InvoiceStatus.Paid
                                     : (otherPaymentsSum > 0 ? Prisma.InvoiceStatus.Partial : Prisma.InvoiceStatus.Pending); // Revert to Pending if no other payments

                     await tx.invoice.update({
                         where: { id: payment.invoiceId },
                         data: { status: newStatus }
                     });
                 }
             }

             // 4. Revert Expense status change (if applicable)
             if (payment.expenseId) {
                  const expense = await tx.expense.findUnique({
                      where: { id: payment.expenseId },
                      select: { amount: true, payments: { select: { id: true, amount: true } } }
                  });
                 if (expense) { // Check if expense still exists
                     const otherPaymentsSum = expense.payments
                         .filter(p => p.id !== id)
                         .reduce((sum, p) => sum + p.amount.toNumber(), 0);
                     // Revert status to Pending if this was the only/last payment making it Paid
                     const newStatus = otherPaymentsSum >= expense.amount.toNumber() ? Prisma.ExpenseStatus.Paid : Prisma.ExpenseStatus.Pending;

                     await tx.expense.update({
                         where: { id: payment.expenseId },
                         data: { status: newStatus }
                     });
                 }
             }

             // 5. Delete the payment record
             await tx.payment.delete({ where: { id } });

             return true; // Indicate success
         });

        // Revalidate relevant paths
        revalidatePath('/payments');
        // Revalidate related invoice/expense pages if needed
        revalidatePath('/dashboard');
        revalidatePath('/bank-accounts');

        return { success: true, message: 'Payment deleted successfully.' };

    } catch (error: unknown) {
         if (checkPrismaInitError(error, `deletePayment Transaction (${id}, Tenant: ${tenantId})`)) {
             return { success: false, message: 'Database Connection Error. Failed to delete payment.', error: 'Initialization Error' };
         }
         console.error(`[DB_ERROR] Failed to delete payment ${id} for tenant ${tenantId}:`, error);
          if (error instanceof Error && (error.message === 'Payment not found.' || error.message.startsWith('Authorization Error'))) {
              return { success: false, message: error.message };
          }
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
              // Should be caught by the initial findUnique, but good backup
              return { success: false, message: 'Record not found during deletion process.', error: error.code };
          }
         return { success: false, message: 'Database Error: Failed to delete payment.', error: error instanceof Error ? error.message : String(error) };
    }
}
