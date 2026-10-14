# The record store

**Status:** v1 built — walk round a 3D record shop, dig the crates, try records on the listening station, fill your bag and pay at the counter. **https://crossfaderhero.com/store**

The shop is stocked from the same music folders as your decks and crates (USB A, USB B and the record crates), so nothing leaves your computer. Every track is a record; the shop sells them back to you as vinyl.

## The shop

- **Bins by genre, filed alphabetically.** One bin per genre (from the ID3 genre tag; untagged records go in *Various*), sorted by artist then title, ignoring "The"/"A", accents and punctuation. A genre with more than 100 records spills into several bins labelled by range ("House · A–G", "House · G–U"). Each bin is a wooden tray on legs with the records standing in it and a label on the front.
- **Digging.** Walk up to a bin and press **E** (or click it). Records flip past like a crate: arrows, scroll, or the letter tabs along the top to jump to an artist's letter. The price sticker is on the sleeve; **P** picks the record up to listen to, **B** puts it in your bag.
- **Listening station** (left). A turntable on a table with speakers and headphones. Records you hold (up to 4) or have in your bag can be tried here: *slide the vinyl out of its sleeve → place on the platter → start the platter → lower the needle*, or press **Play** for both. Scrub along the record to move the needle, switch 33/45, lift the record off, slip it back in its sleeve. It uses the real turntable audio (`audio/turntable.ts`), so the platter, needle and slipmat behave as they do on the decks, and the 3D turntable is the same model. **Step away and the record keeps playing** while you walk round and dig: the shop speakers get quieter and pan as you move away from the station (never silent), a *now playing* chip with a Stop button sits bottom-right, and putting that record back in its bin takes it off the platter.
- **Record bag and counter** (right). The bag holds 12 records. At the counter the clerk rings up the bag, and you pay from your cash (you start with $150). Paid-for records are filed in a crate called **Record store finds** in your collection, so they show up with your other crates in the bedroom and club.
- **Set dressing.** Gig posters and festival line-ups for made-up acts (Velvet Static, Mira Volt, Dusthaus, Outer Orbit, Desert Pulse…), a *What's on* corkboard of upcoming events (open decks, DJ battle heats, record fair, in-store signing), and framed memorabilia: gold and platinum discs, a signed setlist, backstage passes, a signed drumhead, a crew tee and ticket stubs. Vintage audio: a shelf unit of boomboxes, portable CD players, personal stereos, tapes and CDs beside the listening station, a glass display case and hi-fi stack by the door, a radio on the counter and big boomboxes in the back corners. All drawn on canvases or built from primitives (`src/store/decor.ts`); none of it is pickable yet.
- **Prices** are stable per record: $6–$19, more for pressings before 1995, double for the rare ones (about 1 in 13). See `src/store/pricing.ts`.

## Code

| File | What it does |
| --- | --- |
| `store.html`, `src/store/main.tsx` | The page (`/store`), a third entry alongside the bedroom and the club |
| `src/store/stock.ts` | Pure: genre bins, alphabetical filing, divider letters |
| `src/store/pricing.ts` | Pure: prices, rarity, the bag/hand limits, quoting a purchase |
| `src/store/shopState.ts` | What you're holding and what's in the bag (not saved) |
| `src/state/wallet.ts` | Cash and owned records (saved in the browser) |
| `src/store/purchase.ts` | Checkout: take money, mark owned, file into the store crate |
| `src/store/Store.ts` | The three.js shop: walking, collision, bins, counter, clerk, listening station |
| `src/store/decor.ts` | Posters, events board, memorabilia and vintage audio gear |
| `src/store/StoreView.tsx`, `Dig.tsx`, `Station.tsx`, `Counter.tsx`, `store.css` | The screens |
| `src/club/people.ts` | The clerk is a `clerk` style of the club's instanced figures |

The store turns off the library's background BPM/key analysis (`setBackgroundAnalysis(false)`), because browsing doesn't need it; a record is analysed on demand when it goes on the platter.

## Not built yet

- **Ownership gating.** Everything in your folders can still be played on the decks; buying only files a record in the store crate. A later step: only records you've bought (or your own crates) load on the decks and at gigs.
- **Stock rotation.** The shop shows your whole library. Later: restocks, new arrivals, a bargain bin, and only part of the library on the shelves at a time.
- **Income.** Cash only goes down; gig fees and contest prizes should pay in (`useWallet.earn`).
- **Walk-in animation of the vinyl** (it's a 2D slide in the panel; the 3D record appears on the platter when placed) and a 3D record bag.
- **Discogs.** The Discogs API gives release metadata, cover art, tracklists and marketplace prices, but not audio. The realistic route is catalogue and artwork from Discogs (through a small Worker proxy that keeps the API key server-side) with a record playable only when you hold a matching audio file, or licensed/free-licence music for the rest.
