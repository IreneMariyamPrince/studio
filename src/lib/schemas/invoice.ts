
import { z } from 'zod';
import { accountSchema } from './account'; // If linking expenses to accounts

export const clientSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(2, { message: "Client name must be at least 2 characters." }),
  email: z.string().email({ message: "Invalid email address." }).optional().or(z.literal('')), // Allow empty string or valid email
  address: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

export type ClientSchema = z.infer<typeof clientSchema>;

export const invoiceItemSchema = z.object({
  id: z.string().cuid().optional(), // Optional for creation
  invoiceId: z.string().cuid().optional(), // Optional for creation, linked later
  description: z.string().min(1, { message: "Item description cannot be empty." }),
  quantity: z.coerce.number().int().positive({ message: "Quantity must be positive." }),
  unitPrice: z.coerce.number().nonnegative({ message: "Unit price cannot be negative." }),
  total: z.coerce.number().optional(), // Calculated field
});

export type InvoiceItemSchema = z.infer<typeof invoiceItemSchema>;

export const invoiceStatus = ['Draft', 'Pending', 'Paid', 'Overdue', 'Cancelled'] as const;

export const invoiceSchema = z.object({
  id: z.string().cuid().optional(), // Optional for creation
  invoiceNumber: z.string().optional(), // Generated on creation
  clientId: z.string().cuid({ message: "Please select a client." }),
  client: clientSchema.optional(), // Included from relation
  issueDate: z.coerce.date({ required_error: "Issue date is required." }),
  dueDate: z.coerce.date({ required_error: "Due date is required." }),
  status: z.enum(invoiceStatus),
  notes: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, { message: "Invoice must have at least one item." }),
  total: z.coerce.number().optional(), // Calculated field
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

export type InvoiceSchema = z.infer<typeof invoiceSchema>;

// Schema for creating/updating an invoice (might differ slightly)
export const invoiceFormSchema = invoiceSchema.omit({
    id: true,
    invoiceNumber: true,
    createdAt: true,
    updatedAt: true,
    client: true, // Client is linked via clientId
    total: true,   // Total is calculated
    // Items might be handled differently in the form (e.g., separate state)
}).extend({
    items: z.string() // Expect items as a JSON string in the form
});

export type InvoiceFormSchema = z.infer<typeof invoiceFormSchema>;
