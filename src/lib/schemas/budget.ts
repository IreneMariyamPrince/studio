
import { z } from 'zod';
import { ObjectId } from 'mongodb'; // Import ObjectId for validation
// import { accountSchema } from './account'; // Assuming account schema exists

export const budgetSchema = z.object({
  id: z.string().optional(), // Optional for creation
  accountId: z.string({ required_error: "Account is required." }),
  period: z.string().regex(/^\d{4}(-\d{2})?$/, { message: "Period must be YYYY or YYYY-MM format." }), // e.g., "2024" or "2024-01"
  amount: z.coerce.number().nonnegative({ message: "Budget amount cannot be negative." }),
  createdAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string
  updatedAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string

  // Optional relation data (Ensure AccountSchema also uses ObjectId validation if included)
  // account: accountSchema.optional(),
});

export type BudgetSchema = z.infer<typeof budgetSchema>;

// Schema for forms might omit server-managed fields
export const budgetFormSchema = budgetSchema.omit({
    id: true, createdAt: true, updatedAt: true,
    // account: true
});

export type BudgetFormSchema = z.infer<typeof budgetFormSchema>;
