
'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { budgetSchema, budgetFormSchema, BudgetSchema } from '@/lib/schemas/budget';
import { getTenantId } from '@/lib/utils/tenant'; // Helper to get tenant ID

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};

// Flag to prevent spamming the console with the same libssl error
let libsslErrorLogged = false;

// Helper function to check and log Prisma init errors
// Returns true if it WAS an initialization error, false otherwise
function checkPrismaInitError(error: unknown, context: string): boolean {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error(`[ACTION_ERROR] Prisma Initialization Error in ${context}:`, error.message);
         // Log the more detailed environment message only once
         if (error.message.includes('libssl') && !libsslErrorLogged) {
             console.error("DATABASE CONNECTION FAILED: Prisma cannot find the required `libssl` system library (e.g., libssl.so.1.1). This is an ENVIRONMENT ISSUE. Please ensure OpenSSL 1.1 or 3 (check Prisma version compatibility) is installed and accessible in your deployment environment.");
             libsslErrorLogged = true; // Prevent repeated logging
         }
         return true; // Indicate that it was an initialization error
     }
     return false; // Not an initialization error
}

// --- Get Budgets for the current tenant ---
export async function getBudgets(filters?: { year?: number }): Promise<BudgetSchema[]> {
  const tenantId = await getTenantId();
  if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getBudgets.");
      return [];
  }
  const context = `getBudgets (Tenant: ${tenantId})`;

  try {
    const whereClause: Prisma.BudgetWhereInput = { tenantId: tenantId }; // Base filter for tenant
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
  } catch (error) {
    if (checkPrismaInitError(error, context)) {
        console.warn(`[DB_WARN] Database connection failed while fetching budgets for tenant ${tenantId}. Returning empty list.`);
    } else {
        console.error(`[ACTION_ERROR] Error fetching budgets for tenant ${tenantId}:`, error);
        console.warn(`[DB_WARN] Returning empty budgets list for tenant ${tenantId} due to unexpected error.`);
    }
    return [];
  }
}

// --- Add Budget for the current tenant ---
export async function addBudget(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot add budget.' };
   }
   const context = `addBudget (Tenant: ${tenantId})`;

  const rawData = Object.fromEntries(formData.entries());

  const validatedFields = budgetFormSchema.safeParse({
    accountId: rawData.accountId,
    period: rawData.period, // Expecting "YYYY" or "YYYY-MM"
    amount: rawData.amount ? parseFloat(rawData.amount as string) : undefined,
  });

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    console.error(`[VALIDATION_ERROR] ${context}:`, fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  // Validate that the selected account belongs to the tenant
  try {
      const account = await prisma.account.findUnique({ where: { id: validatedFields.data.accountId }, select: { tenantId: true } });
      if (!account || account.tenantId !== tenantId) {
          return { success: false, message: 'Invalid account selected.', fieldErrors: { accountId: ['Invalid account selected.'] } };
      }
  } catch (error) {
      if(checkPrismaInitError(error, `${context} - Account Validation`)) {
           return { success: false, message: 'Database Connection Error during account validation.' };
      }
      console.error(`[DB_ERROR] Error validating account for tenant ${tenantId} during budget creation:`, error);
      return { success: false, message: 'Database error during validation.' };
  }


  try {
    const newBudget = await prisma.budget.create({
      data: {
          ...validatedFields.data,
          tenantId: tenantId, // Set tenant ID
      },
    });

    revalidatePath('/budgets'); // Revalidate the budget list page
    revalidatePath('/reports'); // Budgets affect reports
    return { success: true, message: `Budget for period ${newBudget.period} added successfully.`, data: newBudget };
  } catch (error: unknown) {
     if (checkPrismaInitError(error, context)) {
         return { success: false, message: 'Database Connection Error. Failed to add budget.', error: 'Initialization Error' };
     }
     console.error(`[DB_ERROR] ${context}:`, error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
       // Unique constraint violation (tenantId + accountId + period)
       if (error.code === 'P2002') {
         return {
             success: false,
             message: 'Database Error: A budget for this account and period already exists for this tenant.',
             error: error.code,
             fieldErrors: { period: ['Budget already exists for this account/period.'], accountId: ['Budget already exists for this account/period.']}
          };
       }
       // Foreign key constraint (invalid accountId - less likely due to pre-check)
       if (error.code === 'P2003' && (error.meta?.field_name as string)?.includes('accountId')) {
           return { success: false, message: 'Database Error: The selected account does not exist.', error: error.code };
       }
     }
    return {
        success: false,
        message: 'Database Error: Failed to add budget.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Update Budget for the current tenant ---
export async function updateBudget(formData: FormData): Promise<ActionResult> {
    const tenantId = await getTenantId();
    if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
    const budgetId = formData.get('id') as string;
    if (!budgetId) return { success: false, message: "Budget ID missing." };
    const context = `updateBudget (ID: ${budgetId}, Tenant: ${tenantId})`;

    // 1. Verify budget belongs to the tenant
    try {
        const budget = await prisma.budget.findUnique({ where: { id: budgetId }, select: { tenantId: true } });
        if (!budget) return { success: false, message: 'Budget not found.' };
        if (budget.tenantId !== tenantId) return { success: false, message: 'Authorization Error.' };
    } catch (error) {
         if(checkPrismaInitError(error, `${context} - Ownership Check`)) {
             return { success: false, message: 'Database Connection Error during ownership check.' };
         }
        console.error(`[DB_ERROR] Error verifying budget ownership in ${context}:`, error);
        return { success: false, message: 'Database error verifying budget ownership.' };
    }

    // 2. Validate form data (period, amount) and related account ownership
    // ... validation ...

    // 3. Perform update
    try {
        const updatedBudget = await prisma.budget.update({
            where: { id: budgetId },
            data: { /* validated amount, potentially period */ },
        });
        revalidatePath('/budgets');
        revalidatePath('/reports');
        return { success: true, message: 'Budget updated successfully.' };
    } catch (error) {
         if (checkPrismaInitError(error, context)) {
             return { success: false, message: 'Database Connection Error. Failed to update budget.', error: 'Initialization Error' };
         }
         console.error(`[DB_ERROR] ${context}:`, error);
        // Handle DB errors (connection, unique constraint if period/account changes)
        return { success: false, message: 'Database Error: Failed to update budget.' /* + specific error handling */ };
    }
}

// --- Delete Budget for the current tenant ---
export async function deleteBudget(id: string): Promise<ActionResult> {
    const tenantId = await getTenantId();
    if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
    if (!id) return { success: false, message: "Budget ID missing." };
    const context = `deleteBudget (ID: ${id}, Tenant: ${tenantId})`;

    try {
         // 1. Verify budget belongs to the tenant
        const budget = await prisma.budget.findUnique({ where: { id }, select: { tenantId: true } });
        if (!budget) return { success: false, message: 'Budget not found.', error: 'P2025' };
        if (budget.tenantId !== tenantId) return { success: false, message: 'Authorization Error.' };

        // 2. Perform delete
        await prisma.budget.delete({ where: { id } });

        revalidatePath('/budgets');
        revalidatePath('/reports');
        return { success: true, message: 'Budget deleted successfully.' };
    } catch (error) {
        if (checkPrismaInitError(error, context)) {
           return { success: false, message: 'Database Connection Error. Failed to delete budget.', error: 'Initialization Error' };
        }
        console.error(`[DB_ERROR] ${context}:`, error);
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
             return { success: false, message: 'Budget not found.', error: error.code };
         }
        return { success: false, message: 'Database Error: Failed to delete budget.' };
    }
}
