import { z } from 'zod';

export const tenantSchema = z.object({
  id: z.string().optional(), // Optional for creation
  name: z.string().min(2, { message: "Tenant name must be at least 2 characters." }),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

export type TenantSchema = z.infer<typeof tenantSchema>;

// Schema for forms might omit server-managed fields
export const tenantFormSchema = tenantSchema.omit({
    id: true, createdAt: true, updatedAt: true
});

export type TenantFormSchema = z.infer<typeof tenantFormSchema>;
