
import { z } from 'zod';
import { ObjectId } from 'mongodb'; // Import ObjectId for validation
import type { TenantSchema } from './tenant'; // Import Tenant schema type if needed for relations

export const userRoles = ['Admin', 'Accountant', 'Viewer'] as const;

export const userSchema = z.object({
  id: z.string().optional(), // Optional for creation if using DB IDs
  firebaseUid: z.string().optional(), // Firebase UID is often the primary identifier
  email: z.string().email({ message: "Invalid email address." }),
  name: z.string().optional(),
  role: z.enum(userRoles).default('Viewer'),
  isActive: z.boolean().optional().default(true),
  isSuperAdmin: z.boolean().optional().default(false), // Flag for super admin

  tenantId: z.string().optional(), // Tenant association (optional for SuperAdmin)
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),


  // Optional relation data (Ensure TenantSchema uses ObjectId validation if included)
  // tenant: z.lazy(() => tenantSchema).optional(),
});

export type UserSchema = z.infer<typeof userSchema>;

// Schema for forms might omit server-managed fields
export const userFormSchema = userSchema.omit({
    id: true, createdAt: true, updatedAt: true, firebaseUid: true, isSuperAdmin: true, // These are managed internally
    // tenant: true, // tenantId is likely assigned during creation or managed separately
});

export type UserFormSchema = z.infer<typeof userFormSchema>;
