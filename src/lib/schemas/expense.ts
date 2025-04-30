
import { z } from 'zod';
import { ObjectId } from 'mongodb'; // Import ObjectId for validation
import { accountSchema } from './account'; // Import Account schema
import { vendorSchema } from './vendor';   // Import Vendor schema
import { taxRateSchema } from './taxRate'; // Import TaxRate schema

export const expenseStatus = ['Pending', 'Approved', 'Rejected', 'Paid'] as const;

export const expenseSchema = z.object({
  // id: z.string().cuid().optional(), // Optional for creation
  id: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid ObjectId" }).optional(), // Validate as ObjectId string
  date: z.coerce.date({ required_error: "Expense date is required." }).or(z.string().datetime()), // Allow Date or ISO string
  // accountId: z.string().cuid({ message: "Please select an expense account." }),
  accountId: z.string({ required_error: "Expense account is required." }).refine((val) => ObjectId.isValid(val), { message: "Invalid Account ObjectId" }), // Validate as ObjectId string
  amount: z.coerce.number().positive({ message: "Amount must be a positive number." }),
  description: z.string().optional(),
  receiptUrl: z.string().url().optional().or(z.literal('')), // Optional URL for receipt
  status: z.enum(expenseStatus).default('Pending'),
  // vendorId: z.string().cuid().optional(), // Optional link to Vendor
  vendorId: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid Vendor ObjectId" }).optional(), // Validate as ObjectId string
  isRecurring: z.boolean().optional().default(false),
  recurrenceRule: z.string().optional(), // e.g., "FREQ=MONTHLY;INTERVAL=1" - requires parsing
  // taxRateId: z.string().cuid().optional(), // Optional link to TaxRate
  taxRateId: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid Tax Rate ObjectId" }).optional(), // Validate as ObjectId string
  createdAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string
  updatedAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string

  // Related data included from fetches (ensure related schemas also use ObjectId validation)
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
