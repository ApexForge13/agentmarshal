// Session-scoped singleton feed store (Bubble 16).
//
// Bubble 14 scoped the InMemoryReceiptFeedSource to the TradingDesk component, so
// only the dashboard that produced a receipt could see it. The ambient feed + the
// /audit-trail page change that: the dashboard WRITES continuously and a separate
// route READS the same stream. Lifting the source to a module-level singleton
// gives every route one shared store for the browser session.
//
// IMPORTANT: this only shares state across CLIENT-SIDE navigation (next/link). A
// full page reload re-initializes the module, resetting the session — which is the
// correct "new session" semantics. The sidebar uses <Link> between dashboard pages
// so the store (and the ambient stream) survives navigation.

import { InMemoryReceiptFeedSource } from './feed';

// Holds more than the 50-row default so /audit-trail has something to paginate and
// the ambient loop can run a while before the oldest rows scroll off. Bounded so a
// long-lived tab never grows without limit.
const SHARED_FEED_CAPACITY = 200;

/** The one feed store for this browser session. Both / and /audit-trail subscribe. */
export const sharedFeed = new InMemoryReceiptFeedSource(SHARED_FEED_CAPACITY);

/**
 * When this module first loaded — i.e., the start of the dashboard session. Shown
 * on the /audit-trail default rail. Module-level, so it is stable across the
 * session and resets only on a full reload.
 */
export const sessionStartedAt: string = new Date().toISOString();
