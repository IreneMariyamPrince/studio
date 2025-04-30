import { z } from 'zod';

export const accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const;

export const accountSchema = z.object({
  id: z.string().optional(), // Optional for creation, required for updates handled separately
  code: z.string().min(3, { message: "Account code must be at least 3 characters." }).max(10, { message: "Account code cannot exceed 10 characters."}),
  name: z.string().min(2, { message: "Account name must be at least 2 characters." }),
  type: z.enum(accountTypes, { required_error: "Please select an account type." }),
  description: z.string().optional(),
  balance: z.coerce.number().optional().default(0), // Optional: Handled mainly on server/DB for balance sheet accounts
  isActive: z.boolean().optional().default(true),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

export type AccountSchema = z.infer<typeof accountSchema>;

// Schema for creation/update forms might omit server-managed fields
export const accountFormSchema = accountSchema.omit({
  id: true, createdAt: true, updatedAt: true, balance: true // Balance is calculated/updated via transactions
});

export type AccountFormSchema = z.infer<typeof accountFormSchema>;
