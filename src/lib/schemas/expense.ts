
import { z } from 'zod';
import { accountSchema } from './account'; // Import Account schema

export const expenseStatus = ['Pending', 'Approved', 'Rejected'] as const;

export const expenseSchema = z.object({
  id: z.string().cuid().optional(), // Optional for creation
  date: z.coerce.date({ required_error: "Expense date is required." }),
  accountId: z.string().cuid({ message: "Please select an expense account." }),
  account: accountSchema.optional(), // Include related account data when fetching
  amount: z.coerce.number().positive({ message: "Amount must be a positive number." }),
  description: z.string().optional(),
  receiptUrl: z.string().url().optional().or(z.literal('')), // Optional URL for receipt
  status: z.enum(expenseStatus),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

export type ExpenseSchema = z.infer<typeof expenseSchema>;

// Schema potentially used for forms (might differ based on file handling)
export const expenseFormSchema = expenseSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    account: true, // Linked via accountId
    receiptUrl: true, // Handled separately
}).extend({
    // Add field for file upload if needed
    // receiptFile: z.instanceof(File).optional(),
});

export type ExpenseFormSchema = z.infer<typeof expenseFormSchema>;
