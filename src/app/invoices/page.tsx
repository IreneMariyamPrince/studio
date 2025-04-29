
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, FileText, Eye, Edit, Trash2 } from 'lucide-react'; // Added icons
import {
  Table,
  TableHeader,
  TableBody,
  // TableFooter, // Removed for now
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import Link from 'next/link';
import { getInvoices } from '@/lib/actions/invoices'; // Import server action
import { format } from 'date-fns'; // For date formatting
import { Badge } from '@/components/ui/badge'; // For status display
import 'server-only'; // Ensure data fetching on server
import { DeleteInvoiceDialog } from './_components/delete-invoice-dialog'; // Import delete dialog

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// Map status to badge variants (optional)
const statusVariantMap: { [key: string]: "default" | "secondary" | "destructive" | "outline" } = {
  Paid: "default", // Consider a 'success' variant (green)
  Pending: "secondary",
  Draft: "outline",
  Overdue: "destructive",
  Cancelled: "destructive",
};

export default async function InvoicesPage() {
  // Fetch invoices on the server
  const invoices = await getInvoices();

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Manage Invoices</h1>
        <Button asChild>
          <Link href="/invoices/new">
            <PlusCircle className="mr-2 h-4 w-4" /> Create New Invoice
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoice List</CardTitle>
          <CardDescription>View and manage all company invoices.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>A list of your company's recent invoices.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Invoice #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                  <TableCell>{invoice.client.name}</TableCell> {/* Access nested client name */}
                  <TableCell>{format(new Date(invoice.issueDate), 'PP')}</TableCell>
                  <TableCell>{format(new Date(invoice.dueDate), 'PP')}</TableCell>
                  <TableCell>
                     <Badge variant={statusVariantMap[invoice.status] || 'outline'}>
                       {invoice.status}
                     </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(invoice.total)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    {/* Link to View Invoice Page (create later) */}
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                      <Link href={`/invoices/${invoice.id}`} title="View Invoice Details">
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">View Invoice</span>
                      </Link>
                    </Button>
                     {/* Link to Edit Invoice Page (create later) */}
                     <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                        <Link href={`/invoices/${invoice.id}/edit`} title="Edit Invoice">
                            <Edit className="h-4 w-4" />
                            <span className="sr-only">Edit Invoice</span>
                        </Link>
                     </Button>
                     {/* Link to Generate/View PDF */}
                     <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                      <Link href={`/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer" title="View PDF">
                       <FileText className="h-4 w-4" />
                       <span className="sr-only">View PDF</span>
                      </Link>
                     </Button>
                     {/* Delete Invoice Dialog */}
                      <DeleteInvoiceDialog invoiceId={invoice.id!} invoiceNumber={invoice.invoiceNumber!}>
                           <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Delete Invoice">
                               <Trash2 className="h-4 w-4" />
                               <span className="sr-only">Delete Invoice</span>
                           </Button>
                      </DeleteInvoiceDialog>
                  </TableCell>
                </TableRow>
              ))}
              {invoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No invoices found. <Link href="/invoices/new" className="text-primary underline">Create one now</Link>.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {/* Optional Footer */}
            {/* <TableFooter>
              <TableRow>
                <TableCell colSpan={5}>Total Outstanding</TableCell>
                <TableCell className="text-right">$850.50</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableFooter> */}
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
