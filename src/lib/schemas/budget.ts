
import { z } from 'zod';
import { ObjectId } from 'mongodb'; // Import ObjectId for validation
// import { accountSchema } from './account'; // Assuming account schema exists

export const budgetSchema = z.object({
  // id: z.string().cuid().optional(), // Optional for creation
  id: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid ObjectId" }).optional(), // Validate as ObjectId string
  // accountId: z.string().cuid({ message: "Account is required." }),
  accountId: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid Account ObjectId" }), // Validate as ObjectId string
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
