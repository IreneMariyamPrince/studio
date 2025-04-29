import { z } from 'zod';
import { accountSchema } from './account'; // Import Account schema
import { vendorSchema } from './vendor';   // Import Vendor schema
import { taxRateSchema } from './taxRate'; // Import TaxRate schema

export const expenseStatus = ['Pending', 'Approved', 'Rejected', 'Paid'] as const;

export const expenseSchema = z.object({
  id: z.string().cuid().optional(), // Optional for creation
  date: z.coerce.date({ required_error: "Expense date is required." }),
  accountId: z.string().cuid({ message: "Please select an expense account." }),
  amount: z.coerce.number().positive({ message: "Amount must be a positive number." }),
  description: z.string().optional(),
  receiptUrl: z.string().url().optional().or(z.literal('')), // Optional URL for receipt
  status: z.enum(expenseStatus).default('Pending'),
  vendorId: z.string().cuid().optional(), // Optional link to Vendor
  isRecurring: z.boolean().optional().default(false),
  recurrenceRule: z.string().optional(), // e.g., "FREQ=MONTHLY;INTERVAL=1" - requires parsing
  taxRateId: z.string().cuid().optional(), // Optional link to TaxRate
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),

  // Related data included from Prisma fetches
  account: accountSchema.optional(),
  vendor: vendorSchema.optional(),
  // taxRate: taxRateSchema.optional(),
});

export type ExpenseSchema = z.infer<typeof expenseSchema>;

// Schema for creating/updating an expense form
export const expenseFormSchema = expenseSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    account: true, // Linked via accountId
    vendor: true,  // Linked via vendorId
    // taxRate: true, // Linked via taxRateId
    receiptUrl: true, // Handle file upload separately
}).extend({
    // Optional field for handling file uploads in the form
    // receiptFile: z.instanceof(File).optional(),
});

export type ExpenseFormSchema = z.infer<typeof expenseFormSchema>;
