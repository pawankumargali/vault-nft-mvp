// src/indexer.js
import 'dotenv/config';
import pRetry from 'p-retry';
import { PrismaClient } from '@prisma/client';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import {
  VAULT_PACKAGE_ID as PACKAGE_ID,
  VAULT_MODULE_NAME as MODULE_NAME,
  INDEXING_BATCH_LIMIT as BATCH_LIMIT,
  INDEXER_POLL_MS   as POLL_MS,
  SUI_NETWORK
} from '../config.js';

/** @typedef {import('@mysten/sui.js/client').SuiEvent} SuiEvent */
/** @typedef {{ tx: string, seq: bigint }} Pos */

// --- Configuration Checks ---
if (!PACKAGE_ID) {
  console.error('ERROR: VAULT_PACKAGE_ID is not defined in .env or config.js.');
  process.exit(1);
}
if (!MODULE_NAME) {
  console.error('ERROR: VAULT_MODULE_NAME is not defined in .env or config.js.');
  process.exit(1);
}
if (!SUI_NETWORK) {
  console.error('ERROR: SUI_NETWORK is not defined in .env or config.js. Please specify (e.g., devnet, testnet, mainnet).');
  process.exit(1);
}

const prisma = new PrismaClient();
const sui = new SuiClient({
  // url: getFullnodeUrl(SUI_NETWORK)
  url: 'https://rpc-testnet.suiscan.xyz/'
});

// --- Constants for initial cursor state ---
const GENESIS_TX_DIGEST = '0x0000000000000000000000000000000000000000000000000000000000000000';
const GENESIS_SEQ = BigInt(-1);

/* ---------------------------------------------------------------------- */
/* helpers                                                                */
/* ---------------------------------------------------------------------- */

function cmp(a /** @type Pos */, b /** @type Pos */) {
  if (!a || !b) {
    if (a === b) return 0;
    return a ? 1 : -1;
  }
  // Primary comparison should be on the sequence number
  if (a.seq < b.seq) return -1;
  if (a.seq > b.seq) return 1;

  // As a tie-breaker (for the same sequence number, which is rare but possible across different transactions),
  // a consistent but arbitrary comparison on tx can be used.
  if (a.tx < b.tx) return -1;
  if (a.tx > b.tx) return 1;

  return 0;
}

const isAfter = (evPos /** @type Pos */, dbPos /** @type Pos */) => cmp(evPos, dbPos) > 0;
const isBeforeOrEqual = (evPos /** @type Pos */, dbPos /** @type Pos */) => cmp(evPos, dbPos) <= 0;

/** Map raw SuiEvent → DB row */
function toRow(ev /** @type SuiEvent */) {
  return {
    seq: BigInt(ev.id.eventSeq),
    txn_digest: ev.id.txDigest,
    package_id: ev.packageId,
    txn_module: ev.transactionModule,
    evt_type: ev.type,
    timestamp_ms: BigInt(ev.timestampMs),
    payload_json: ev.parsedJson ?? {},
  };
}

/**
 * Persist rows to DB and update cursor in one transaction.
 * @param {Array<ReturnType<typeof toRow>>} rows
 * @returns {Promise<Pos | null>} The position of the last persisted event, or null if no rows.
 */
async function persist(rows) {
  if (!rows || rows.length === 0) return null;
  const tail = rows.at(-1);

  await pRetry(async () => {
    await prisma.$transaction([

      prisma.event.createMany({ data: rows, skipDuplicates: true }),

       prisma.cursor.upsert({
        where: { id: 1 },
        create: { id: 1, lastTxDigest: tail.txn_digest, lastSeq: tail.seq },
        update: { lastTxDigest: tail.txn_digest, lastSeq: tail.seq },
      })

    ]);
  }, {
    retries: 5,
    minTimeout: 1000,
    onFailedAttempt: error => {
      console.warn(`\n⚠️ Persist attempt ${error.attemptNumber} failed. Retrying... Error: ${error.message}`);
    },
  });

  try {
    process.stdout.write(`\r💾 Persisted ${rows.length} events. Cursor at: ${tail.txn_digest.slice(0, 8)}… #${tail.seq}`);
  } catch (e) { /* ignore stdout errors */ }

  return { tx: tail.txn_digest, seq: tail.seq };
}

/* ---------------------------------------------------------------------- */
/* bootstrap                                                              */
/* ---------------------------------------------------------------------- */

/**
 * Fetches the current cursor position from the database.
 * Initializes a cursor if one doesn't exist.
 * @returns {Promise<Pos>}
 */
async function getDbCursor() {
  let dbCursor = await prisma.cursor.findUnique({ where: { id: 1 } });
  if (!dbCursor) {
    console.log('📀 No existing DB cursor found. Initializing to genesis.');
    dbCursor = {
      id: 1,
      lastTxDigest: GENESIS_TX_DIGEST,
      lastSeq: GENESIS_SEQ,
    };
    // Ensure the cursor row exists for subsequent upserts by persist()
    await prisma.cursor.upsert({
        where: { id: 1 },
        create: { id: 1, lastTxDigest: dbCursor.lastTxDigest, lastSeq: dbCursor.lastSeq },
        update: {},
    });
  }
  return { tx: dbCursor.lastTxDigest, seq: dbCursor.lastSeq };
}

const eventFilter = { MoveModule: { package: PACKAGE_ID, module: MODULE_NAME } };

async function catchUp() {
  console.log('⏫ Catch-up phase started...');

  let currentDbPos = await getDbCursor();

  // Fetch the latest event on-chain to define the upper bound for catch-up
  const headEventPage = await pRetry(() => sui.queryEvents({ query: eventFilter, order: 'descending', limit: 1 }), {
    onFailedAttempt: e => console.warn(`Failed to fetch head event: ${e.message}. Retrying...`)
  });
  const headEvent = headEventPage.data[0];

  let onChainHeadPos /** @type Pos */;
  if (headEvent) {
    onChainHeadPos = { tx: headEvent.id.txDigest, seq: BigInt(headEvent.id.eventSeq) };
    console.log('📡 Current on-chain head:', onChainHeadPos.tx.slice(0,8) + '... #' + onChainHeadPos.seq);
  } else {
    console.log('📡 No events found on-chain for this filter. Assuming up-to-date with genesis.');
    onChainHeadPos = { ...currentDbPos }; // No new events, head is current DB position
  }

  if (cmp(currentDbPos, onChainHeadPos) >= 0) {
    console.log('✅⏩ DB cursor is at or ahead of on-chain head. Catch-up not needed.');
    return;
  }

  console.log(`⏳ Catching up from DB pos: ${currentDbPos.tx.slice(0,8)}... #${currentDbPos.seq} to on-chain head: ${onChainHeadPos.tx.slice(0,8)}... #${onChainHeadPos.seq}`);

  let rpcCursor = (currentDbPos?.tx === GENESIS_TX_DIGEST)
    ? null // If at genesis, start from the beginning.
    : { txDigest: currentDbPos.tx, eventSeq: currentDbPos.seq.toString() }; // Otherwise, start from the last known event.

  while (true) {
    const page = await pRetry(() => sui.queryEvents({
      query: eventFilter,
      cursor: rpcCursor,
      limit: Number(BATCH_LIMIT),
      order: 'ascending',
    }), {
      onFailedAttempt: e => console.warn(`Failed to fetch event page during catch-up: ${e.message}. Retrying...`)
    });

    const rowsToPersist = [];
    let lastEventInPagePos = null;

    if (page.data.length > 0) {
        for (const ev of page.data) {
            const eventPos = { tx: ev.id.txDigest, seq: BigInt(ev.id.eventSeq) };
            if (!isAfter(eventPos, currentDbPos)) {
                continue; // Skip events already processed or at currentDbPos
            }
            rowsToPersist.push(toRow(ev));
            lastEventInPagePos = eventPos;
        }
    }


    if (rowsToPersist.length > 0) {
      const persistedPos = await persist(rowsToPersist);
      if (persistedPos) {
        currentDbPos = persistedPos; // IMPORTANT: Update currentDbPos to the latest persisted event
      }
    }

    // Determine break conditions

    if (!page.hasNextPage) {
      console.log('\nReached end of event stream (no next page).');
      break;

    }

    rpcCursor = page.nextCursor;
    if (!rpcCursor) { // Should be redundant if page.hasNextPage is false, but good for safety
        console.log('\nNo next RPC cursor, ending catch-up.');
        break;
    }
  }
  // Ensure currentDbPos is at least the onChainHeadPos if we processed up to it
  // Or it's the last event processed if onChainHeadPos was not reached due to no more events.
  // The currentDbPos is already updated inside the loop by persist.
  console.log(`\n✅ Catch-up finished. DB cursor now at: ${currentDbPos.tx.slice(0,8)}... #${currentDbPos.seq}`);
}

/* ---------------------------------------------------------------------- */
/* 2️⃣ poller  [currentDbPos, ∞)                                          */
/* ---------------------------------------------------------------------- */

async function startPoller() {
  let currentDbPos = await getDbCursor();
  console.log(`\n⏰ Poller starting. Will poll every ${POLL_MS}ms for new events after: ${currentDbPos.tx.slice(0,8)}... #${currentDbPos.seq}`);
  let isPolling = false; // To prevent concurrent polls if one takes too long

  setInterval(async () => {
    if (isPolling) {
      // console.log('Previous poll still in progress, skipping this interval.');
      return;
    }
    isPolling = true;
    try {

      let rpcCursor = (currentDbPos?.tx === GENESIS_TX_DIGEST)
        ? null // If at genesis, start from the beginning.
        : { txDigest: currentDbPos.tx, eventSeq: currentDbPos.seq.toString() }; // Otherwise, start from the last known event.

      // Fetch events in descending order to get the latest first
      const page = await pRetry(() => sui.queryEvents({
        query: eventFilter,
        cursor: rpcCursor,
        order: 'ascending',
        limit: Number(BATCH_LIMIT), // Fetch a batch, then filter
      }), {
        onFailedAttempt: e => console.warn(`Poller failed to fetch events: ${e.message}. Retrying on next cycle...`)
        // Not retrying immediately within the interval, but relying on next interval
      });

      const newEventsBatch = [];
      if (page.data.length > 0) {
        for (const ev of page.data) {
          const eventPos = { tx: ev.id.txDigest, seq: BigInt(ev.id.eventSeq) };
          // If event is before or equal to our current DB position, we've seen it or older ones.
          // Since we query in descending order, all subsequent events in this batch will also be older or same.
          if (isBeforeOrEqual(eventPos, currentDbPos)) {
            break;
          }
          newEventsBatch.push(toRow(ev));
        }
      }

      if (newEventsBatch.length > 0) {
        newEventsBatch.reverse(); // Process oldest of the new events first
        const persistedPos = await persist(newEventsBatch); // persist will use its own pRetry
        if (persistedPos) {
          currentDbPos = persistedPos; // Update currentDbPos to the latest persisted event
        }
      } else {
        // No new events found in this poll
        // process.stdout.write(`\r🔎 No new events found at ${new Date().toLocaleTimeString()}`);
      }
    } catch (e) {
      // This catch is for errors not handled by pRetry within the calls (e.g., programming errors here)
      // or if pRetry itself gives up.
      console.error('\n⚠️ Unrecoverable error in poller interval:', e);
      // Depending on the error, might want to stop the poller or have more sophisticated recovery
    } finally {
      isPolling = false;
    }
  }, Number(POLL_MS));
}

/* ---------------------------------------------------------------------- */
/* run                                                                    */
/* ---------------------------------------------------------------------- */

async function main() {
  console.log(`Sui Indexer for Package: ${PACKAGE_ID}, Module: ${MODULE_NAME} on ${SUI_NETWORK}`);
  console.log(`Batch limit: ${BATCH_LIMIT}, Poll interval: ${POLL_MS}ms`);
  console.log('---');
  const currentDbPos = await getDbCursor();
  console.log('📀 Initial DB cursor:', currentDbPos.tx.slice(0,8) + '... #' + currentDbPos.seq);
  await catchUp();
  startPoller();
}

// Graceful Shutdown
let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n🚦 Received ${signal}. Shutting down gracefully...`);
  // Stop new polls (though setInterval will stop on process exit)
  // If there were active operations like a long `persist` call,
  // ideally we'd wait for them. p-retry helps make persist more robust.

  try {
    await prisma.$disconnect();
    console.log('📦 Prisma client disconnected.');
  } catch (e) {
    console.error('Error disconnecting Prisma:', e);
  }
  console.log('👋 Exiting.');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

main().catch(err => {
  console.error('\n💥 Unhandled error in main execution:', err);
  prisma.$disconnect().finally(() => process.exit(1));
});
