
import { z } from 'zod';
import { ObjectId } from 'mongodb'; // Import ObjectId for validation
import { clientSchema } from './client'; // Import Client schema
import { taxRateSchema } from './taxRate'; // Import TaxRate schema
import { accountSchema } from './account'; // Import Account schema

export const invoiceItemSchema = z.object({
  // id: z.string().cuid().optional(), // Optional for creation
  id: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid Item ObjectId" }).optional(), // Validate as ObjectId string
  // invoiceId: z.string().cuid().optional(), // Optional for creation, linked later
  invoiceId: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid Invoice ObjectId" }).optional(), // Validate as ObjectId string
  description: z.string().min(1, { message: "Item description cannot be empty." }),
  quantity: z.coerce.number().int().positive({ message: "Quantity must be positive." }),
  unitPrice: z.coerce.number().nonnegative({ message: "Unit price cannot be negative." }),
  total: z.coerce.number().optional(), // Calculated field (quantity * unitPrice + tax)
  // taxRateId: z.string().cuid().optional(), // Optional link to TaxRate
  taxRateId: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid Tax Rate ObjectId" }).optional(), // Validate as ObjectId string
  createdAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string
  updatedAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string

  // Optional relation data (Ensure TaxRateSchema also uses ObjectId validation if included)
  // taxRate: taxRateSchema.optional(),
});

export type InvoiceItemSchema = z.infer<typeof invoiceItemSchema>;

export const invoiceStatus = ['Draft', 'Pending', 'Paid', 'Partial', 'Overdue', 'Cancelled'] as const;

export const invoiceSchema = z.object({
  // id: z.string().cuid().optional(), // Optional for creation
  id: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid ObjectId" }).optional(), // Validate as ObjectId string
  invoiceNumber: z.string().optional(), // Generated on creation
  // clientId: z.string().cuid({ message: "Please select a client." }),
  clientId: z.string({ required_error: "Client is required." }).refine((val) => ObjectId.isValid(val), { message: "Invalid Client ObjectId" }), // Validate as ObjectId string
  issueDate: z.coerce.date({ required_error: "Issue date is required." }).or(z.string().datetime()), // Allow Date or ISO string
  dueDate: z.coerce.date({ required_error: "Due date is required." }).or(z.string().datetime()), // Allow Date or ISO string
  status: z.enum(invoiceStatus),
  notes: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, { message: "Invoice must have at least one item." }),
  total: z.coerce.number().optional(), // Calculated field (sum of item totals)
  createdAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string
  updatedAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string
  // revenueAccountId: z.string().cuid().optional(), // Optional link to revenue account
  revenueAccountId: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid Revenue Account ObjectId" }).optional(), // Validate as ObjectId string

  // Related data included from fetches (Ensure related schemas use ObjectId validation)
  client: clientSchema.optional(),
  // revenueAccount: accountSchema.optional(), // Define accountSchema if needed here
});

export type InvoiceSchema = z.infer<typeof invoiceSchema>;

// Schema for creating/updating an invoice form
export const invoiceFormSchema = invoiceSchema.omit({
    id: true,
    invoiceNumber: true,
    createdAt: true,
    updatedAt: true,
    client: true, // Client linked via clientId
    // revenueAccount: true, // Linked via revenueAccountId
    total: true,   // Total is calculated server-side
    items: true, // Items handled separately in UI/form logic (e.g., useFieldArray or JSON string)
}).extend({
    // Typically, items are managed in UI state and converted before submission
    // Example: Expecting items as a JSON string from the form
    items: z.string().refine(val => {
        try {
            const parsed = JSON.parse(val);
            // Basic check: is it an array and has at least one item?
            // More robust validation should happen on the parsed array using invoiceItemSchema
            return Array.isArray(parsed) && parsed.length > 0;
        } catch (e) {
            return false;
        }
    }, { message: "Invoice must have at least one item (valid JSON format required)." }),
});

export type InvoiceFormSchema = z.infer<typeof invoiceFormSchema>;
