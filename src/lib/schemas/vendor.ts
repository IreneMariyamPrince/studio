import { z } from 'zod';

export const vendorSchema = z.object({
  id: z.string().optional(), // Optional for creation
  name: z.string().min(2, { message: "Vendor name must be at least 2 characters." }),
  email: z.string().email({ message: "Invalid email address." }).optional().or(z.literal('')), // Allow empty string or valid email
  phone: z.string().optional(),
  address: z.string().optional(),
  paymentTerms: z.string().optional(),
  balanceOwed: z.coerce.number().optional().default(0), // Handled by server actions/DB
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

export type VendorSchema = z.infer<typeof vendorSchema>;

// Schema for forms might omit server-managed fields
export const vendorFormSchema = vendorSchema.omit({
    id: true, createdAt: true, updatedAt: true, balanceOwed: true
});

export type VendorFormSchema = z.infer<typeof vendorFormSchema>;
