
import { z } from 'zod';
import { ObjectId } from 'mongodb'; // Import ObjectId for validation

export const paymentSchema = z.object({
  id: z.string().optional(), // Optional for creation
  paymentDate: z.coerce.date({ required_error: "Payment date is required." }),

  amount: z.coerce.number().positive({ message: "Amount must be a positive number." }),
  paymentMethod: z.string().min(1, { message: "Payment method is required." }), // e.g., "Credit Card", "Bank Transfer"
  reference: z.string().optional(), // e.g., Check number, Transaction ID
  notes: z.string().optional(),

  bankAccountId: z.string({ message: "Bank account is required." }),
  invoiceId: z.string().optional(), // If paying an invoice
  expenseId: z.string().optional(), // If paying an expense
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),

  // Related data (optional, included in fetches - Ensure related schemas use ObjectId validation)
  // bankAccount: bankAccountSchema.optional(), // Define bankAccountSchema elsewhere
  // invoice: invoiceSchema.optional(),        // Define invoiceSchema elsewhere
  // expense: expenseSchema.optional(),        // Define expenseSchema elsewhere
});

export type PaymentSchema = z.infer<typeof paymentSchema>;

// Schema for forms might omit server-managed fields
export const paymentFormSchema = paymentSchema.omit({
    id: true, createdAt: true, updatedAt: true,
    // Omit related objects if they are not part of the form directly
    // bankAccount: true, invoice: true, expense: true
});

export type PaymentFormSchema = z.infer<typeof paymentFormSchema>;
