
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
           <div className="mx-auto bg-destructive/10 p-3 rounded-full w-fit">
            <AlertTriangle className="w-10 h-10 text-destructive" />
           </div>
          <CardTitle className="mt-4 text-2xl">Unauthorized Access</CardTitle>
          <CardDescription>
            You do not have permission to access the requested resource or tenant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Please contact your administrator if you believe this is an error.</p>
          <Link href="/dashboard" className="mt-4 inline-block text-primary hover:underline">
            Return to Dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
