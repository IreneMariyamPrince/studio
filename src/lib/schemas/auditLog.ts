import { z } from 'zod';
// import { userSchema } from './user'; // Assuming user schema exists

export const auditLogSchema = z.object({
  id: z.string().cuid().optional(), // Server generated
  timestamp: z.coerce.date().optional(), // Server generated
  userId: z.string().cuid().optional(), // ID of the user performing action
  action: z.string(), // e.g., "create_invoice", "update_expense"
  entity: z.string(), // e.g., "Invoice", "Expense", "Account"
  entityId: z.string().optional(), // ID of the affected entity
  details: z.any().optional(), // Store old/new values as JSON

  // Optional relation data
  // user: userSchema.optional(),
});

export type AuditLogSchema = z.infer<typeof auditLogSchema>;

// Audit logs are typically not created via forms, but by server actions internally.
