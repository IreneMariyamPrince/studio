
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function LoginPage() {
  // TODO: Implement actual login form and logic using Firebase Auth or another provider
  return (
    <div className="flex items-center justify-center min-h-screen bg-secondary/50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>
            Enter your email below to login to your account. (Not implemented)
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="m@example.com" required disabled />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required disabled />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col">
          <Button className="w-full" disabled>Sign in</Button>
           <p className="mt-4 text-xs text-center text-muted-foreground">
              Login functionality is not yet implemented.
              <br />
              Proceed to <Link href="/dashboard" className="underline">Dashboard</Link> (if accessible).
           </p>
           {/* Add signup link if needed */}
           {/* <div className="mt-4 text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="underline">
              Sign up
            </Link>
          </div> */}
        </CardFooter>
      </Card>
    </div>
  );
}
