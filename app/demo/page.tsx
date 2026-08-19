import { BugCard } from './BugCard';
import styles from './page.module.css';

export default function DemoPage() {
  return (
    <main className={styles.main}>
      <span className={styles.liveBadge}>Live demo</span>
      <h1 className={styles.heading}>Viewport UI Checker - Demo</h1>
      <p className={styles.intro}>
        Every card below looks completely fine on a laptop or desktop. Scan this page at Mobile vs. Tablet/Laptop/
        Desktop and compare - all 3 bugs only show up below 640px wide.
      </p>
      {/* 1. Image that spills out of its frame: the frame itself is
          responsive (`.imageFrame`: 160px below `sm`, 288px from `sm` up),
          but the image inside it is a fixed 220px wide regardless of
          width - exactly the kind of image tag that looks fine because
          whoever added it only ever previewed it on a laptop, where the
          frame is 288px (wider than the image). Below `sm`, the frame
          shrinks to 160px while the image stays 220px, so it overflows
          its own box by 60px - well past the checker's 4px rounding
          tolerance either way. */}
      <BugCard
        number={1}
        title="Image spills out of its frame"
        description="This image is fixed at 220px wide, but its frame shrinks to 160px on a phone - so on a phone the image spills out past its own frame by 60px. How it's fixed: from Tablet (768px) up the frame widens to 288px, comfortably wider than the image, so nothing spills out."
      >
        <div className={styles.imageFrame}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/demo-banner.svg"
            alt="Demo banner, fixed width, wider than its frame on a phone"
            width={220}
            height={53}
            className={styles.spillingImage}
          />
        </div>
      </BugCard>

      {/* 2. Label text gets cut off: a fixed-width, overflow-hidden label
          with no wrap handling. 96px is too narrow for this text at any
          font size readable on a phone, so it clips below `sm`; 224px
          (`sm:` override) gives it enough room that the same text fits on
          one line from Tablet up. */}
      <BugCard
        number={2}
        title="Label text gets cut off"
        description="This label's box is only 96px wide on a phone - too narrow for its own text, which gets clipped with no wrap or ellipsis. How it's fixed: from Tablet (768px) up the box widens to 224px, with room to spare for the text to fit on one line."
      >
        <p className={styles.clippedLabel}>Outdoor Furniture Sale</p>
      </BugCard>

      <p className={styles.footer}>
        Want to see more of what this tool catches? Head to <code className={styles.inlineCode}>/demo/edge-cases</code>{' '}
        for 9 more real bugs, each with its own fix at a different breakpoint (Desktop, 1440px) than the bugs here -
        including overlapping elements, an off-screen element, and a fixed bar covering content.
      </p>
    </main>
  );
}
