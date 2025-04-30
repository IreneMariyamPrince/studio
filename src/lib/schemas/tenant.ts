
import { z } from 'zod';
import { ObjectId } from 'mongodb'; // Import ObjectId for validation

export const tenantSchema = z.object({
  id: z.string().optional(), // Optional for creation
  name: z.string().min(2, { message: "Tenant name must be at least 2 characters." }),
  createdAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string
  updatedAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string
});

export type TenantSchema = z.infer<typeof tenantSchema>;

// Schema for forms might omit server-managed fields
export const tenantFormSchema = tenantSchema.omit({
    id: true, createdAt: true, updatedAt: true
});

export type TenantFormSchema = z.infer<typeof tenantFormSchema>;
