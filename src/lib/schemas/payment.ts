
import { z } from 'zod';
import { ObjectId } from 'mongodb'; // Import ObjectId for validation

export const paymentSchema = z.object({
  // id: z.string().cuid().optional(), // Optional for creation
  id: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid ObjectId" }).optional(), // Validate as ObjectId string
  paymentDate: z.coerce.date({ required_error: "Payment date is required." }).or(z.string().datetime()), // Allow Date or ISO string
  amount: z.coerce.number().positive({ message: "Amount must be a positive number." }),
  paymentMethod: z.string().min(1, { message: "Payment method is required." }), // e.g., "Credit Card", "Bank Transfer"
  reference: z.string().optional(), // e.g., Check number, Transaction ID
  notes: z.string().optional(),
  // bankAccountId: z.string().cuid({ message: "Bank account is required." }),
  bankAccountId: z.string({ required_error: "Bank account is required." }).refine((val) => ObjectId.isValid(val), { message: "Invalid Bank Account ObjectId" }), // Validate as ObjectId string
  // invoiceId: z.string().cuid().optional(), // If paying an invoice
  invoiceId: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid Invoice ObjectId" }).optional(), // Validate as ObjectId string
  // expenseId: z.string().cuid().optional(), // If paying an expense
  expenseId: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid Expense ObjectId" }).optional(), // Validate as ObjectId string
  createdAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string
  updatedAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string

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
