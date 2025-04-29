
'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { budgetSchema, budgetFormSchema, BudgetSchema } from '@/lib/schemas/budget';
import { Prisma } from '@prisma/client';

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};

// --- Get Budgets ---
export async function getBudgets(filters?: { year?: number }): Promise<BudgetSchema[]> {
  try {
    const whereClause: Prisma.BudgetWhereInput = {};
    if (filters?.year) {
      // Filter by periods starting with the given year (e.g., "2024" or "2024-xx")
      whereClause.period = { startsWith: String(filters.year) };
    }

    const budgets = await prisma.budget.findMany({
        where: whereClause,
        orderBy: [{ period: 'asc' }, { account: { code: 'asc' } }], // Order by period then account
        include: {
            account: { select: { id: true, name: true, code: true } }
        }
    });

    // Validate structure - adjust parsing as needed
     return budgets.map(budget => budgetSchema.parse({
        ...budget,
        amount: budget.amount.toNumber(), // Convert Decimal
        account: budget.account // Include selected account fields
     }));
    // return budgets as BudgetSchema[]; // Cast if validation is complex
  } catch (error) {
     if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[ACTION_ERROR] Prisma Initialization Error fetching budgets:", error.message);
         if (error.message.includes('libssl')) {
              console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library. Ensure OpenSSL is installed. Returning empty list.");
         } else {
              console.error("Database connection failed. Returning empty list.");
         }
        return [];
    }
    console.error("[ACTION_ERROR] Error fetching budgets:", error);
    return [];
  }
}

// --- Add Budget ---
export async function addBudget(formData: FormData): Promise<ActionResult> {
  const rawData = Object.fromEntries(formData.entries());

  const validatedFields = budgetFormSchema.safeParse({
    accountId: rawData.accountId,
    period: rawData.period, // Expecting "YYYY" or "YYYY-MM"
    amount: rawData.amount ? parseFloat(rawData.amount as string) : undefined,
  });

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    console.error("[VALIDATION_ERROR] addBudget:", fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  try {
    const newBudget = await prisma.budget.create({
      data: validatedFields.data,
    });

    revalidatePath('/budgets'); // Revalidate the budget list page
    revalidatePath('/reports'); // Budgets affect reports
    return { success: true, message: `Budget for period ${newBudget.period} added successfully.`, data: newBudget };
  } catch (error: unknown) {
     console.error("[DB_ERROR] Failed to add budget:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
       // Unique constraint violation (accountId + period)
       if (error.code === 'P2002') {
         return {
             success: false,
             message: 'Database Error: A budget for this account and period already exists.',
             error: error.code,
             fieldErrors: { period: ['Budget already exists for this account/period.'], accountId: ['Budget already exists for this account/period.']}
          };
       }
       // Foreign key constraint (invalid accountId)
       if (error.code === 'P2003' && (error.meta?.field_name as string)?.includes('accountId')) {
           return {
                success: false,
                message: 'Database Error: The selected account does not exist.',
                error: error.code,
                fieldErrors: { accountId: ['Invalid account selected.'] }
            };
       }
     } else if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[DB_ERROR] Prisma Initialization Error during budget creation:", error.message);
         if (error.message.includes('libssl')) {
              console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library.");
         }
        return {
            success: false,
            message: 'Database Connection Error. Failed to add budget.',
            error: 'Initialization Error'
        };
    }
    return {
        success: false,
        message: 'Database Error: Failed to add budget.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Update Budget ---
export async function updateBudget(formData: FormData): Promise<ActionResult> {
  // Placeholder: Implement update logic
  console.log("Update budget action called (Not Implemented)", Object.fromEntries(formData.entries()));
   const budgetId = formData.get('id') as string;
   if (!budgetId) return { success: false, message: "Budget ID missing." };
   // Validation (check for duplicate period/account on update?), Prisma update, revalidation...
  return { success: false, message: 'Update Budget - Not Implemented Yet' };
}

// --- Delete Budget ---
export async function deleteBudget(id: string): Promise<ActionResult> {
  // Placeholder: Implement delete logic
   console.log("Delete budget action called (Not Implemented)", id);
   if (!id) return { success: false, message: "Budget ID missing." };
   // Prisma delete, revalidation...
  return { success: false, message: 'Delete Budget - Not Implemented Yet' };
}
