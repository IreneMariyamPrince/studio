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
import { getJournalEntries } from '@/lib/actions/journalEntries'; // Adjust path if needed
import type { JournalEntrySchema } from '@/lib/schemas/journalEntry';
import { format } from 'date-fns';
// Import Add/Edit/Delete dialogs when created
// import { AddJournalEntryDialog } from './_components/add-journal-entry-dialog';
// import { EditJournalEntryDialog } from './_components/edit-journal-entry-dialog';
// import { DeleteJournalEntryDialog } from './_components/delete-journal-entry-dialog';
import 'server-only';

function calculateTotalDebits(lines: any[]): number {
    return lines.filter(l => l.type === 'Debit').reduce((sum, l) => sum + parseFloat(l.amount), 0);
}

function calculateTotalCredits(lines: any[]): number {
     return lines.filter(l => l.type === 'Credit').reduce((sum, l) => sum + parseFloat(l.amount), 0);
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}


export default async function JournalEntriesPage() {
  const journalEntries: JournalEntrySchema[] = await getJournalEntries();

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Journal Entries</h1>
        {/* <AddJournalEntryDialog> */}
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Create New Entry (Not Implemented)
          </Button>
        {/* </AddJournalEntryDialog> */}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entry Log</CardTitle>
          <CardDescription>Manage manual journal entries for adjustments and corrections.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>List of journal entries.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Total Debits</TableHead>
                <TableHead className="text-right">Total Credits</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {journalEntries.map((entry) => {
                const totalDebits = calculateTotalDebits(entry.lines);
                const totalCredits = calculateTotalCredits(entry.lines);
                return (
                  <TableRow key={entry.id}>
                    <TableCell>{format(new Date(entry.entryDate), 'PP')}</TableCell>
                    <TableCell>{entry.reference || '-'}</TableCell>
                    <TableCell className="max-w-[300px] truncate" title={entry.description}>{entry.description}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalDebits)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalCredits)}</TableCell>
                    <TableCell className="text-right space-x-1">
                       <Button variant="ghost" size="icon" className="h-8 w-8" disabled title="View Details">
                         <FileSearch className="h-4 w-4" />
                         <span className="sr-only">View Entry Details</span>
                       </Button>
                       {/* <EditJournalEntryDialog entry={entry}> */}
                         <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                           <Edit className="h-4 w-4" />
                           <span className="sr-only">Edit Entry</span>
                         </Button>
                       {/* </EditJournalEntryDialog> */}
                       {/* <DeleteJournalEntryDialog entryId={entry.id!} entryRef={entry.reference || entry.description.substring(0,20)}> */}
                         <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled>
                           <Trash2 className="h-4 w-4" />
                           <span className="sr-only">Delete Entry</span>
                         </Button>
                       {/* </DeleteJournalEntryDialog> */}
                    </TableCell>
                  </TableRow>
                );
            })}
              {journalEntries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No journal entries found.
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
