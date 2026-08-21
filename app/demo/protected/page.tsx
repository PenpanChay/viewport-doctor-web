/**
 * Only renders past the session check below - reachable from a real browser
 * by logging in at /demo/login, or from a scan by passing the storageState
 * that /api/demo-login-storage-state captures from that same login flow.
 * Scanning this URL with no storageState lands on /demo/login instead (via
 * the redirect() below), which is exactly the "wrong page got scanned"
 * failure mode the storageState feature exists to avoid.
 *
 * The session cookie itself is AES-256-GCM ciphertext (see
 * lib/demoAuth.ts), not a plain flag - proving the storageState feature
 * works against a real encrypted-token session, not just a trivial one.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BugCard } from '../BugCard';
import { DEMO_SESSION_COOKIE, verifyEncryptedSessionToken } from '@/lib/demoAuth';

export default async function ProtectedDemoPage() {
  const cookieStore = await cookies();
  const username = verifyEncryptedSessionToken(cookieStore.get(DEMO_SESSION_COOKIE)?.value);
  if (!username) {
    redirect('/demo/login');
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 font-sans text-zinc-900 dark:text-zinc-50">
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
        🔒 Logged in
      </span>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Welcome back, {username}</h1>
      <p className="mt-3 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
        This page only renders past the session check in this route&apos;s own file, which decrypts an AES-256-GCM
        session cookie rather than reading a plain flag. Visit it in a private/incognito window with no cookies and
        you land on <code className="rounded bg-black/[.06] px-1 py-0.5 dark:bg-white/[.08]">/demo/login</code>{' '}
        instead.
      </p>

      <BugCard
        number={1}
        title="Account label gets cut off"
        description="This account label is fixed at 96px wide on a phone - too narrow for its own text, which gets clipped with no wrap or ellipsis. How it's fixed: from Tablet (768px) up the box widens to 224px, with room to spare."
      >
        <p className="w-24 overflow-hidden whitespace-nowrap rounded-lg border border-zinc-300 p-2 text-sm dark:border-zinc-700 sm:w-56">
          demo@viewport-doctor.test
        </p>
      </BugCard>

      <form action="/api/demo-logout" method="POST" className="mt-10">
        <button type="submit" className="text-xs text-zinc-500 underline hover:no-underline dark:text-zinc-400">
          Log out
        </button>
      </form>
    </main>
  );
}
