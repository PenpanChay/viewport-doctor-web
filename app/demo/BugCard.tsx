import type { ReactNode } from 'react';
import styles from './BugCard.module.css';

/**
 * Shared "one bug, one card" layout used by both /demo and
 * /demo/edge-cases - a numbered badge, a title, a plain-language
 * description of what's wrong, then the actual markup that triggers the
 * bug. Kept as a shared component (not copy-pasted per page) so the two
 * demo pages read as one consistent system instead of two different
 * styles that happen to look similar.
 */
export function BugCard({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <span className={styles.badge}>{number}</span>
        <h2 className={styles.title}>{title}</h2>
      </div>
      <p className={styles.description}>{description}</p>
      <div className={styles.content}>{children}</div>
    </section>
  );
}
