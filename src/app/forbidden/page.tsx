
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react'; // Using a different icon

export default function ForbiddenPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto bg-yellow-500/10 p-3 rounded-full w-fit">
            <ShieldAlert className="w-10 h-10 text-yellow-600" />
          </div>
          <CardTitle className="mt-4 text-2xl">Access Forbidden</CardTitle>
          <CardDescription>
            Your role does not grant you permission to access this page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>If you need access, please contact your administrator to adjust your role.</p>
          <Link href="/dashboard" className="mt-4 inline-block text-primary hover:underline">
            Return to Dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
