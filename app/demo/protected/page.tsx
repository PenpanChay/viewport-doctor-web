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
import styles from './page.module.css';

export default async function ProtectedDemoPage() {
  const cookieStore = await cookies();
  const username = verifyEncryptedSessionToken(cookieStore.get(DEMO_SESSION_COOKIE)?.value);
  if (!username) {
    redirect('/demo/login');
  }

  return (
    <main className={styles.main}>
      <span className={styles.badge}>🔒 Logged in</span>
      <h1 className={styles.heading}>Welcome back, {username}</h1>
      <p className={styles.intro}>
        This page only renders past the session check in this route&apos;s own file, which decrypts an AES-256-GCM
        session cookie rather than reading a plain flag. Visit it in a private/incognito window with no cookies and
        you land on <code className={styles.inlineCode}>/demo/login</code> instead.
      </p>

      <BugCard
        number={1}
        title="Account label gets cut off"
        description="This account label is fixed at 96px wide on a phone - too narrow for its own text, which gets clipped with no wrap or ellipsis. How it's fixed: from Tablet (768px) up the box widens to 224px, with room to spare."
      >
        <p className={styles.accountLabel}>demo@viewport-doctor.test</p>
      </BugCard>

      <form action="/api/demo-logout" method="POST" className={styles.logoutForm}>
        <button type="submit" className={styles.logoutButton}>
          Log out
        </button>
      </form>
    </main>
  );
}
