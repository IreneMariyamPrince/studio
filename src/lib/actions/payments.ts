

'use server';

import { revalidatePath } from 'next/cache';
import { Collection, ObjectId, WithId, MongoServerError } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { paymentSchema, paymentFormSchema, PaymentSchema } from '@/lib/schemas/payment';
import { getTenantId } from '@/lib/utils/tenant';

// Type definition for MongoDB documents
type PaymentDocument = Omit<PaymentSchema, 'id' | 'bankAccountId' | 'invoiceId' | 'expenseId'> & {
    _id?: ObjectId;
    tenantId: string;
    bankAccountId: ObjectId; // Store as ObjectId
    invoiceId?: ObjectId | null; // Store as ObjectId if present
    expenseId?: ObjectId | null; // Store as ObjectId if present
    createdAt?: Date;
    updatedAt?: Date;
};
// Simplified lookup types
type BankAccountLookupInfo = { _id: ObjectId; name: string; };
type InvoiceLookupInfo = { _id: ObjectId; invoiceNumber: string; total: number; status: string; payments?: { amount: number }[] }; // Include needed fields
type ExpenseLookupInfo = { _id: ObjectId; description?: string | null; amount: number; status: string; payments?: { amount: number }[] };

// Helper to get collections
async function getPaymentsCollection(): Promise<Collection<PaymentDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<PaymentDocument>('payments');
}
async function getBankAccountsCollection(): Promise<Collection<any>> {
    const { db } = await connectToDatabase();
    return db.collection('bankAccounts');
}
async function getInvoicesCollection(): Promise<Collection<any>> {
    const { db } = await connectToDatabase();
    return db.collection('invoices');
}
async function getExpensesCollection(): Promise<Collection<any>> {
    const { db } = await connectToDatabase();
    return db.collection('expenses');
}

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};


// --- Get Payments for the current tenant ---
export async function getPayments(): Promise<PaymentSchema[]> {
  const tenantId = await getTenantId();
  if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getPayments.");
      return [];
  }
  const context = `getPayments (Tenant: ${tenantId})`;

  try {
    const paymentsCollection = await getPaymentsCollection();
     // Use aggregation to join related data
    const paymentsCursor = paymentsCollection.aggregate([
        { $match: { tenantId: tenantId } },
        { $sort: { paymentDate: -1 } },
        { $lookup: { from: 'bankAccounts', localField: 'bankAccountId', foreignField: '_id', as: 'bankAccountInfo' } },
        { $lookup: { from: 'invoices', localField: 'invoiceId', foreignField: '_id', as: 'invoiceInfo' } },
        { $lookup: { from: 'expenses', localField: 'expenseId', foreignField: '_id', as: 'expenseInfo' } },
        {
             $project: { // Reshape output
                _id: 1, paymentDate: 1, amount: 1, paymentMethod: 1, reference: 1, notes: 1, createdAt: 1, updatedAt: 1,
                bankAccountId: 1, invoiceId: 1, expenseId: 1, // Keep ObjectIds for mapping
                bankAccount: { $arrayElemAt: ['$bankAccountInfo', 0] },
                invoice: { $arrayElemAt: ['$invoiceInfo', 0] },
                expense: { $arrayElemAt: ['$expenseInfo', 0] }
            }
        }
    ]);
    const paymentsArray = await paymentsCursor.toArray();

    // Map and parse data
    return paymentsArray.map(p => {
        // Serialize dates before parsing
        const serializablePayment = {
            ...p,
            id: p._id?.toHexString(),
            bankAccountId: p.bankAccountId?.toHexString(),
            invoiceId: p.invoiceId?.toHexString() ?? undefined,
            expenseId: p.expenseId?.toHexString() ?? undefined,
            paymentDate: p.paymentDate?.toISOString(), // Convert Date to ISO string
            createdAt: p.createdAt?.toISOString(),
            updatedAt: p.updatedAt?.toISOString(),
            amount: p.amount, // Assuming number
            reference: p.reference ?? undefined,
            notes: p.notes ?? undefined,
            // Map nested objects
            bankAccount: p.bankAccount ? { id: p.bankAccount._id?.toHexString(), name: p.bankAccount.name } : undefined,
            invoice: p.invoice ? { id: p.invoice._id?.toHexString(), invoiceNumber: p.invoice.invoiceNumber } : undefined,
            expense: p.expense ? { id: p.expense._id?.toHexString(), description: p.expense.description, amount: p.expense.amount } : undefined,
        };
        return paymentSchema.parse(serializablePayment);
    });
  } catch (error) {
    console.error(`[ACTION_ERROR] ${context}:`, error);
    console.warn(`[DB_WARN] Returning empty payments list for tenant ${tenantId} due to unexpected error.`);
    return [];
  }
}

// --- Add Payment for the current tenant ---
export async function addPayment(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot record payment.' };
   }
   const context = `addPayment (Tenant: ${tenantId})`;

   // --- 1. Validate Form Data ---
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

  if (!validatedFields.success) { /* handle error */ }

  // --- 2. Validate ObjectIDs and Tenant Ownership ---
   let bankAccountObjectId: ObjectId;
   let invoiceObjectId: ObjectId | undefined | null = undefined;
   let expenseObjectId: ObjectId | undefined | null = undefined;
   const { amount, invoiceId: invoiceIdString, expenseId: expenseIdString, ...paymentData } = validatedFields.data; // Destructure validated data


   try {
       bankAccountObjectId = new ObjectId(validatedFields.data.bankAccountId);
       if (invoiceIdString) invoiceObjectId = new ObjectId(invoiceIdString);
       if (expenseIdString) expenseObjectId = new ObjectId(expenseIdString);

       // Check relations belong to the tenant
       const bankAccountsCollection = await getBankAccountsCollection();
       const bankAccount = await bankAccountsCollection.findOne({ _id: bankAccountObjectId, tenantId: tenantId }, { projection: { _id: 1 } });
       if (!bankAccount) return { success: false, message: 'Invalid bank account.', fieldErrors: { bankAccountId: ['Invalid.'] } };

       if (invoiceObjectId) {
            const invoicesCollection = await getInvoicesCollection();
            const invoice = await invoicesCollection.findOne({ _id: invoiceObjectId, tenantId: tenantId }, { projection: { _id: 1 } });
            if (!invoice) return { success: false, message: 'Invalid invoice.', fieldErrors: { invoiceId: ['Invalid.'] } };
       }
       if (expenseObjectId) {
            const expensesCollection = await getExpensesCollection();
            const expense = await expensesCollection.findOne({ _id: expenseObjectId, tenantId: tenantId }, { projection: { _id: 1 } });
            if (!expense) return { success: false, message: 'Invalid expense.', fieldErrors: { expenseId: ['Invalid.'] } };
       }
       if (invoiceObjectId && expenseObjectId) {
           return { success: false, message: 'Payment cannot link to both invoice and expense.' };
       }
       // Optional: Check if payment amount exceeds invoice/expense amount due?

   } catch (error: any) {
        // Handle ObjectId errors and DB errors
         if (error instanceof Error && error.message.includes('Argument passed in must be a single String')) { /* Handle specific invalid IDs */ }
        console.error(`[DB_ERROR] Error validating relations in ${context}:`, error);
        return { success: false, message: 'Database error during validation.' };
   }


  // --- 3. Transaction Logic ---
   const { db, client: mongoClient } = await connectToDatabase();
   const session = mongoClient.startSession();
  try {
    let createdPaymentData: any = null;

    await session.withTransaction(async () => {
        const paymentsCollection = db.collection<PaymentDocument>('payments');
        const bankAccountsCollection = db.collection('bankAccounts');
        const invoicesCollection = db.collection('invoices');
        const expensesCollection = db.collection('expenses');

      // 1. Create the payment record
      const newPaymentResult = await paymentsCollection.insertOne({
          ...paymentData,
          tenantId: tenantId,
          amount: amount,
          bankAccountId: bankAccountObjectId,
          invoiceId: invoiceObjectId,
          expenseId: expenseObjectId,
          createdAt: new Date(),
          updatedAt: new Date(),
      }, { session });
       if (!newPaymentResult.insertedId) throw new Error("Failed to insert payment.");
       createdPaymentData = { id: newPaymentResult.insertedId.toHexString() }; // Store ID for return

      // 2. Update related Invoice status/balance (if applicable)
      if (invoiceObjectId) {
        // Fetch invoice and *all* its payments within the transaction
        const invoice = await invoicesCollection.findOne({ _id: invoiceObjectId }, { session });
        const allPaymentsForInvoice = await paymentsCollection.find({ invoiceId: invoiceObjectId }, { session }).toArray();

        if (!invoice) throw new Error(`Invoice ${invoiceObjectId} not found during transaction.`);

        const totalPaid = allPaymentsForInvoice.reduce((sum, p) => sum + p.amount, 0); // Recalculate total paid
        const balanceDue = invoice.total - totalPaid;
        const newStatus = balanceDue <= 0.005 ? 'Paid' : 'Partial'; // Assuming these statuses exist

        await invoicesCollection.updateOne(
          { _id: invoiceObjectId },
          { $set: { status: newStatus /* TODO: Update client balanceDue? */, updatedAt: new Date() } },
          { session }
        );
      }

      // 3. Update related Expense status (if applicable)
      if (expenseObjectId) {
         const expense = await expensesCollection.findOne({ _id: expenseObjectId }, { session });
         const allPaymentsForExpense = await paymentsCollection.find({ expenseId: expenseObjectId }, { session }).toArray();

         if (!expense) throw new Error(`Expense ${expenseObjectId} not found during transaction.`);

         const totalPaid = allPaymentsForExpense.reduce((sum, p) => sum + p.amount, 0);
         const newStatus = totalPaid >= expense.amount ? 'Paid' : 'Pending'; // Assuming these statuses

         await expensesCollection.updateOne(
             { _id: expenseObjectId },
             { $set: { status: newStatus, updatedAt: new Date() } },
             { session }
         );
      }

      // 4. Update Bank Account balance
      await bankAccountsCollection.updateOne(
        { _id: bankAccountObjectId },
        { $inc: { balance: -amount } }, // DECREMENT balance
        { session }
      );

    }); // End transaction

    await session.endSession();

    // Revalidate relevant paths
    revalidatePath('/payments');
    if (invoiceObjectId) revalidatePath(`/invoices/${invoiceIdString}`);
    if (expenseObjectId) revalidatePath(`/expenses/${expenseIdString}`);
    revalidatePath('/dashboard');
    revalidatePath('/bank-accounts');

    return { success: true, message: 'Payment recorded successfully.', data: createdPaymentData };

  } catch (error: unknown) {
     await session.endSession(); // Ensure session closure on error
     console.error(`[DB_ERROR] ${context} Transaction:`, error);
    return {
        success: false,
        message: 'Database Transaction Error: Failed to record payment.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Update Payment ---
export async function updatePayment(formData: FormData): Promise<ActionResult> {
   // Similar structure to addPayment, but with complex transaction:
   // 1. Validate input & relations.
   // 2. Start Transaction.
   // 3. Find OLD payment, verify ownership. Store its details (amount, links).
   // 4. Revert OLD balance/status changes (bank, invoice/expense).
   // 5. Apply NEW balance/status changes based on validated form data.
   // 6. Update the payment record itself.
   // 7. Commit Transaction.
   // 8. Revalidate.
   console.warn("Update Payment - MongoDB implementation requires careful transaction logic for reverting/applying balances/statuses.");
   return { success: false, message: 'Update Payment - Not Implemented Yet (MongoDB)' };
}

// --- Delete Payment ---
export async function deletePayment(idString: string): Promise<ActionResult> {
    const tenantId = await getTenantId();
    if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
    if (!idString) return { success: false, message: "Payment ID missing." };
    const context = `deletePayment (ID: ${idString}, Tenant: ${tenantId})`;

    let paymentId: ObjectId;
    try { paymentId = new ObjectId(idString); }
    catch { return { success: false, message: 'Invalid Payment ID format.' }; }

   // --- Transaction Logic ---
    const { db, client: mongoClient } = await connectToDatabase();
    const session = mongoClient.startSession();
    try {
         let payment: WithId<PaymentDocument> | null = null; // Store payment details for revalidation

         await session.withTransaction(async () => {
             const paymentsCollection = db.collection<PaymentDocument>('payments');
             const bankAccountsCollection = db.collection('bankAccounts');
             const invoicesCollection = db.collection('invoices');
             const expensesCollection = db.collection('expenses');

             // 1. Find the payment and verify ownership
             payment = await paymentsCollection.findOne({ _id: paymentId, tenantId: tenantId }, { session });
             if (!payment) throw new Error('Payment not found or access denied.');

             const amount = payment.amount;

             // 2. Revert Bank Account balance change
             await bankAccountsCollection.updateOne(
                 { _id: payment.bankAccountId },
                 { $inc: { balance: amount } }, // INCREMENT because deleting payment
                 { session }
             );

             // 3. Revert Invoice status/balance change (if applicable)
             if (payment.invoiceId) {
                 // Fetch invoice and *all other* payments within transaction
                 const invoice = await invoicesCollection.findOne({ _id: payment.invoiceId }, { session });
                 if (invoice) { // Check if invoice still exists
                    const otherPayments = await paymentsCollection.find(
                         { invoiceId: payment.invoiceId, _id: { $ne: paymentId } }, // Exclude deleted payment
                         { session }
                    ).toArray();
                    const otherPaymentsSum = otherPayments.reduce((sum, p) => sum + p.amount, 0);
                    const balanceDueAfterDeletion = invoice.total - otherPaymentsSum;
                    const newStatus = balanceDueAfterDeletion <= 0.005 ? 'Paid'
                                   : (otherPaymentsSum > 0 ? 'Partial' : 'Pending');

                    await invoicesCollection.updateOne(
                         { _id: payment.invoiceId },
                         { $set: { status: newStatus, updatedAt: new Date() } },
                         { session }
                    );
                 }
             }

             // 4. Revert Expense status change (if applicable)
             if (payment.expenseId) {
                 const expense = await expensesCollection.findOne({ _id: payment.expenseId }, { session });
                  if (expense) { // Check if expense still exists
                      const otherPayments = await paymentsCollection.find(
                          { expenseId: payment.expenseId, _id: { $ne: paymentId } },
                          { session }
                      ).toArray();
                     const otherPaymentsSum = otherPayments.reduce((sum, p) => sum + p.amount, 0);
                     const newStatus = otherPaymentsSum >= expense.amount ? 'Paid' : 'Pending';

                     await expensesCollection.updateOne(
                         { _id: payment.expenseId },
                         { $set: { status: newStatus, updatedAt: new Date() } },
                         { session }
                     );
                 }
             }

             // 5. Delete the payment record
             await paymentsCollection.deleteOne({ _id: paymentId }, { session });

         }); // End Transaction

        await session.endSession();

        // Revalidate relevant paths
        revalidatePath('/payments');
        if (payment?.invoiceId) revalidatePath(`/invoices/${payment.invoiceId.toHexString()}`);
        if (payment?.expenseId) revalidatePath(`/expenses/${payment.expenseId.toHexString()}`);
        revalidatePath('/dashboard');
        revalidatePath('/bank-accounts');

        return { success: true, message: 'Payment deleted successfully.' };

    } catch (error: unknown) {
        await session.endSession(); // Ensure session closed on error
        console.error(`[DB_ERROR] ${context} Transaction:`, error);
        return {
            success: false,
            message: 'Database Transaction Error: Failed to delete payment.',
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
