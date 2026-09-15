import Link from 'next/link';
import { Button } from '../design-system';

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <h1 className="text-4xl font-bold text-foreground">404</h1>
      <p className="mt-2 text-sm text-muted-foreground">The page you are looking for does not exist.</p>
      <div className="mt-6">
        <Link href="/">
          <Button size="sm">Back to Home</Button>
        </Link>
      </div>
    </main>
  );
}
