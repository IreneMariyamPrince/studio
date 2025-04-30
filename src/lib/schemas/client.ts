
import { z } from 'zod';
import { ObjectId } from 'mongodb'; // Import ObjectId for validation

export const clientSchema = z.object({
  // id: z.string().cuid().optional(), // CUID is usually for Prisma
  id: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid ObjectId" }).optional(), // Validate as ObjectId string
  name: z.string().min(2, { message: "Client name must be at least 2 characters." }),
  email: z.string().email({ message: "Invalid email address." }).optional().or(z.literal('')), // Allow empty string or valid email
  phone: z.string().optional(),
  address: z.string().optional(),
  paymentTerms: z.string().optional(), // e.g., "Net 30"
  balanceDue: z.coerce.number().optional().default(0), // Handled by server actions/DB
  createdAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string
  updatedAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string
});

export type ClientSchema = z.infer<typeof clientSchema>;

// Schema for forms might omit server-managed fields
export const clientFormSchema = clientSchema.omit({
    id: true, createdAt: true, updatedAt: true, balanceDue: true
});

export type ClientFormSchema = z.infer<typeof clientFormSchema>;
