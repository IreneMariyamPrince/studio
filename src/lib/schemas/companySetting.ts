import { z } from 'zod';

export const companySettingSchema = z.object({
  id: z.string().cuid().optional(), // Optional for creation
  tenantId: z.string().cuid({ message: "Tenant ID is required." }),
  companyName: z.string().optional(),
  logoUrl: z.string().url({ message: "Invalid URL format for logo." }).optional().or(z.literal('')),
  address: z.string().optional(),
  // Add other tenant-specific settings here
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

export type CompanySettingSchema = z.infer<typeof companySettingSchema>;

// Form schema might omit ID and timestamps
export const companySettingFormSchema = companySettingSchema.omit({
    id: true, createdAt: true, updatedAt: true, tenantId: true // tenantId is usually implicit
});

export type CompanySettingFormSchema = z.infer<typeof companySettingFormSchema>;
