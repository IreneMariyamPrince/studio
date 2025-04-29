'use client'; // Add this directive to make it a Client Component

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, FileText, Eye } from 'lucide-react'; // Added Eye icon
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import Link from 'next/link';

// Mock data - replace with actual data fetching
const invoices = [
  { invoiceId: 'INV-001', client: 'Acme Corp', issueDate: '2024-05-10', dueDate: '2024-06-09', amount: 1200.00, status: 'Paid' },
  { invoiceId: 'INV-002', client: 'Globex Inc.', issueDate: '2024-05-15', dueDate: '2024-06-14', amount: 850.50, status: 'Pending' },
  { invoiceId: 'INV-003', client: 'Stark Industries', issueDate: '2024-04-20', dueDate: '2024-05-20', amount: 2500.00, status: 'Overdue' },
];

// Placeholder function for viewing/generating PDF - replace with actual implementation
const handleViewPdf = (invoiceId: string) => {
  alert(`Generating PDF for invoice ${invoiceId}... (Implementation needed)`);
  // In a real app, you would likely navigate to a PDF view route or trigger a download.
  // Example: window.open(`/invoices/${invoiceId}/pdf`, '_blank');
};

export default function InvoicesPage() {
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
                <TableHead className="w-[100px]">Invoice ID</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.invoiceId}>
                  <TableCell className="font-medium">{invoice.invoiceId}</TableCell>
                  <TableCell>{invoice.client}</TableCell>
                  <TableCell>{invoice.issueDate}</TableCell>
                  <TableCell>{invoice.dueDate}</TableCell>
                   <TableCell>{invoice.status}</TableCell>
                  <TableCell className="text-right">${invoice.amount.toFixed(2)}</TableCell>
                   <TableCell className="text-right space-x-1">
                     {/* Placeholder for View Invoice action */}
                     <Button variant="ghost" size="icon" className="h-8 w-8" title="View Invoice Details">
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">View Invoice</span>
                      </Button>
                     {/* View PDF Button */}
                     <Button
                       variant="ghost"
                       size="icon"
                       className="h-8 w-8"
                       onClick={() => handleViewPdf(invoice.invoiceId)} // This onClick requires 'use client'
                       title="View PDF"
                      >
                       <FileText className="h-4 w-4" />
                       <span className="sr-only">View PDF</span>
                      </Button>
                      {/* Add edit/delete later if needed */}
                  </TableCell>
                </TableRow>
              ))}
               {invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      No invoices found.
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
