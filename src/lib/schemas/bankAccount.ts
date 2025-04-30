import { z } from 'zod';

export const bankAccountSchema = z.object({
  id: z.string().optional(), // Optional for creation
  name: z.string().min(1, { message: "Account name is required." }),
  accountNumber: z.string().optional(), // Store masked or partial for security
  bankName: z.string().optional(),
  balance: z.coerce.number().optional().default(0), // Handled by server actions/DB
  currency: z.string().default("USD"),
  isDefault: z.boolean().optional().default(false),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

export type BankAccountSchema = z.infer<typeof bankAccountSchema>;

// Schema for forms might omit server-managed fields
export const bankAccountFormSchema = bankAccountSchema.omit({
    id: true, createdAt: true, updatedAt: true, balance: true
});

export type BankAccountFormSchema = z.infer<typeof bankAccountFormSchema>;
