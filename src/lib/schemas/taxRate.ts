
import { z } from 'zod';
import { ObjectId } from 'mongodb'; // Import ObjectId for validation

export const taxRateSchema = z.object({

  id: z.string().optional(), // Optional for creation
  name: z.string().min(1, { message: "Tax rate name is required." }), // e.g., "VAT", "GST"
  ratePercent: z.coerce.number().nonnegative({ message: "Rate must be non-negative." }).max(100, { message: "Rate cannot exceed 100." }), // e.g., 20.00 for 20%
  description: z.string().optional(),
  isDefault: z.boolean().optional().default(false),
  createdAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string
  updatedAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string
});

export type TaxRateSchema = z.infer<typeof taxRateSchema>;

// Schema for forms might omit server-managed fields
export const taxRateFormSchema = taxRateSchema.omit({
    id: true, createdAt: true, updatedAt: true
});

export type TaxRateFormSchema = z.infer<typeof taxRateFormSchema>;
