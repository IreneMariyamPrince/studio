
import { z } from 'zod';
import { ObjectId } from 'mongodb'; // Import ObjectId for validation
import { accountSchema } from './account'; // Assuming account schema exists

export const entryTypes = ['Debit', 'Credit'] as const;

export const journalEntryLineSchema = z.object({

  id: z.string().optional(),
  journalEntryId: z.string().optional(), // Linked on creation
  accountId: z.string({ message: "Account is required for each line." }),
  type: z.enum(entryTypes, { required_error: "Entry type (Debit/Credit) is required." }),
  amount: z.coerce.number().positive({ message: "Amount must be positive." }),
  description: z.string().optional(),
  createdAt: z.coerce.date().or(z.string().datetime()).optional(), // Allow Date or ISO string

  // Optional relation data (Ensure AccountSchema uses ObjectId validation if included)
  // account: accountSchema.optional(),
});

export type JournalEntryLineSchema = z.infer<typeof journalEntryLineSchema>;

export const journalEntrySchema = z.object({
  id: z.string().optional(),
  entryDate: z.coerce.date({ required_error: "Entry date is required." }),
  description: z.string().min(1, { message: "Description is required." }),
  reference: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  createdById: z.string().optional(), // Link to User


  // Array of lines
  lines: z.array(journalEntryLineSchema).min(2, { message: "A journal entry must have at least two lines (one debit, one credit)." })
    .refine(lines => {
      const totalDebits = lines.filter(l => l.type === 'Debit').reduce((sum, l) => sum + l.amount, 0);
      const totalCredits = lines.filter(l => l.type === 'Credit').reduce((sum, l) => sum + l.amount, 0);
      // Use a tolerance for floating point comparisons
      return Math.abs(totalDebits - totalCredits) < 0.001;
    }, { message: "Total debits must equal total credits." }),

  // Optional relation data
  // createdBy: userSchema.optional(), // Define userSchema elsewhere
});

export type JournalEntrySchema = z.infer<typeof journalEntrySchema>;

// Schema for forms might need adjustments for handling lines dynamically
export const journalEntryFormSchema = journalEntrySchema.omit({
  id: true, createdAt: true, updatedAt: true, createdById: true,
  // createdBy: true
}).extend({
    // Lines might be passed as JSON or handled with useFieldArray
    lines: z.string(), // Expect JSON string for lines in simple form
});

export type JournalEntryFormSchema = z.infer<typeof journalEntryFormSchema>;
