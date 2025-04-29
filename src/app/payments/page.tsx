import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Edit, Trash2, FileSearch } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import Link from 'next/link';
import { getPayments } from '@/lib/actions/payments'; // Adjust path if needed
import type { PaymentSchema } from '@/lib/schemas/payment';
import { format } from 'date-fns';
// Import Add/Edit/Delete dialogs when created
// import { AddPaymentDialog } from './_components/add-payment-dialog';
// import { EditPaymentDialog } from './_components/edit-payment-dialog';
// import { DeletePaymentDialog } from './_components/delete-payment-dialog';
import 'server-only';

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default async function PaymentsPage() {
  const payments: any[] = await getPayments(); // Use any for now, refine with included data type

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Manage Payments</h1>
        {/* <AddPaymentDialog> */}
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Record New Payment (Not Implemented)
          </Button>
        {/* </AddPaymentDialog> */}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
          <CardDescription>Track all recorded payments.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>List of recorded payments.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Bank Account</TableHead>
                <TableHead>Related To</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{format(new Date(payment.paymentDate), 'PP')}</TableCell>
                  <TableCell>{payment.paymentMethod}</TableCell>
                  <TableCell>{payment.reference || '-'}</TableCell>
                  <TableCell>{payment.bankAccount?.name || payment.bankAccountId}</TableCell> {/* Display name if included */}
                  <TableCell>
                    {payment.invoice ? (
                      <Link href={`/invoices/${payment.invoiceId}`} className="text-primary hover:underline">
                         Invoice #{payment.invoice.invoiceNumber}
                      </Link>
                    ) : payment.expense ? (
                      <Link href={`/expenses/${payment.expenseId}`} className="text-primary hover:underline">
                         Expense ({payment.expense.description?.substring(0, 20) || formatCurrency(payment.expense.amount)}...)
                      </Link>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                  <TableCell className="text-right space-x-1">
                     <Button variant="ghost" size="icon" className="h-8 w-8" disabled title="View Details">
                         <FileSearch className="h-4 w-4" />
                         <span className="sr-only">View Payment Details</span>
                       </Button>
                    {/* <EditPaymentDialog payment={payment}> */}
                       <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                         <Edit className="h-4 w-4" />
                         <span className="sr-only">Edit Payment</span>
                       </Button>
                     {/* </EditPaymentDialog> */}
                    {/* <DeletePaymentDialog paymentId={payment.id!} paymentRef={payment.reference || `Payment on ${format(new Date(payment.paymentDate), 'PP')}`}> */}
                       <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled>
                         <Trash2 className="h-4 w-4" />
                         <span className="sr-only">Delete Payment</span>
                       </Button>
                     {/* </DeletePaymentDialog> */}
                  </TableCell>
                </TableRow>
              ))}
              {payments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No payments recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
