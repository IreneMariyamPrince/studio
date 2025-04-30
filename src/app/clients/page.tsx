

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import { getClients } from '@/lib/actions/clients'; // Adjust path if needed
import type { ClientSchema } from '@/lib/schemas/client';
import { AddClientDialog } from './_components/add-client-dialog';
import { EditClientDialog, type SerializableClientData } from './_components/edit-client-dialog';
import { DeleteClientDialog } from './_components/delete-client-dialog';
import 'server-only';

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default async function ClientsPage() {
  const clients: ClientSchema[] = await getClients();

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Manage Clients</h1>
        <AddClientDialog>
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Client
          </Button>
        </AddClientDialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Client List</CardTitle>
          <CardDescription>Manage your customer information.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>List of your clients.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Payment Terms</TableHead>
                <TableHead className="text-right">Balance Due</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => {
                 // Serialize data for the client component
                 const serializableClient: SerializableClientData = {
                     id: client.id!,
                     name: client.name,
                     email: client.email,
                     phone: client.phone,
                     address: client.address,
                     paymentTerms: client.paymentTerms,
                     balanceDue: client.balanceDue,
                     createdAt: client.createdAt?.toISOString(),
                     updatedAt: client.updatedAt?.toISOString(),
                 };

                return (
                    <TableRow key={serializableClient.id}>
                      <TableCell className="font-medium">{serializableClient.name}</TableCell>
                      <TableCell>{serializableClient.email || '-'}</TableCell>
                      <TableCell>{serializableClient.phone || '-'}</TableCell>
                      <TableCell>{serializableClient.paymentTerms || '-'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(serializableClient.balanceDue)}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <EditClientDialog client={serializableClient}>
                           <Button variant="ghost" size="icon" className="h-8 w-8">
                             <Edit className="h-4 w-4" />
                             <span className="sr-only">Edit Client</span>
                           </Button>
                         </EditClientDialog>
                         <DeleteClientDialog clientId={serializableClient.id!} clientName={serializableClient.name}>
                           <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                             <Trash2 className="h-4 w-4" />
                             <span className="sr-only">Delete Client</span>
                           </Button>
                         </DeleteClientDialog>
                      </TableCell>
                    </TableRow>
                );
            })}
              {clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No clients found. Add a new client to get started.
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

