import { z } from 'zod';

export const accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const;

export const accountSchema = z.object({
  id: z.string().optional(), // Optional for creation, present for editing
  code: z.string().min(3, { message: "Account code must be at least 3 characters." }).max(10, { message: "Account code cannot exceed 10 characters."}),
  name: z.string().min(2, { message: "Account name must be at least 2 characters." }),
  type: z.enum(accountTypes, { required_error: "Please select an account type." }),
  description: z.string().optional(),
});

export type AccountSchema = z.infer<typeof accountSchema>;
