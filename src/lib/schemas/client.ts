import { z } from 'zod';

export const clientSchema = z.object({
  id: z.string().cuid().optional(), // Optional for creation
  name: z.string().min(2, { message: "Client name must be at least 2 characters." }),
  email: z.string().email({ message: "Invalid email address." }).optional().or(z.literal('')), // Allow empty string or valid email
  phone: z.string().optional(),
  address: z.string().optional(),
  paymentTerms: z.string().optional(), // e.g., "Net 30"
  balanceDue: z.coerce.number().optional().default(0), // Handled by server actions/DB
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

export type ClientSchema = z.infer<typeof clientSchema>;

// Schema for forms might omit server-managed fields
export const clientFormSchema = clientSchema.omit({
    id: true, createdAt: true, updatedAt: true, balanceDue: true
});

export type ClientFormSchema = z.infer<typeof clientFormSchema>;
