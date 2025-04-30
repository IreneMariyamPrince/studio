
import { z } from 'zod';
import { ObjectId } from 'mongodb'; // Import ObjectId for validation

export const companySettingSchema = z.object({
  // id: z.string().cuid().optional(), // Optional for creation
  id: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid ObjectId" }).optional(), // Validate as ObjectId string
  // tenantId: z.string().cuid({ message: "Tenant ID is required." }),
  tenantId: z.string({ required_error: "Tenant ID is required." }).refine((val) => ObjectId.isValid(val), { message: "Invalid Tenant ObjectId" }), // Validate as ObjectId string
  companyName: z.string().optional(),
  logoUrl: z.string().url({ message: "Invalid URL format for logo." }).optional().or(z.literal('')),
  address: z.string().optional(),
  // Add other tenant-specific settings here
  createdAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string
  updatedAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string
});

export type CompanySettingSchema = z.infer<typeof companySettingSchema>;

// Form schema might omit ID and timestamps
export const companySettingFormSchema = companySettingSchema.omit({
    id: true, createdAt: true, updatedAt: true, tenantId: true // tenantId is usually implicit
});

export type CompanySettingFormSchema = z.infer<typeof companySettingFormSchema>;
