import { z } from 'zod';

export const userRoles = ['Admin', 'Accountant', 'Viewer'] as const;

export const userSchema = z.object({
  id: z.string().cuid().optional(), // Optional for creation if using DB IDs
  firebaseUid: z.string().optional(), // Firebase UID is often the primary identifier
  email: z.string().email({ message: "Invalid email address." }),
  name: z.string().optional(),
  role: z.enum(userRoles).default('Viewer'),
  isActive: z.boolean().optional().default(true),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

export type UserSchema = z.infer<typeof userSchema>;

// Schema for forms might omit server-managed fields
export const userFormSchema = userSchema.omit({
    id: true, createdAt: true, updatedAt: true, firebaseUid: true // Firebase UID managed by auth
});

export type UserFormSchema = z.infer<typeof userFormSchema>;
