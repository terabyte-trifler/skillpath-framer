# Skillpath — Framer code component

A landing page for a fictional learning platform. The courses section is a React
code component that fetches live data from a deliberately unreliable API.

**`Skillpath.tsx`** exports three components — `Hero`, `Courses`, `Footer`.
Paste it into Framer under **Assets → Code → New Code File**; all three appear
separately in the Assets panel.

---

## The API, as measured

Base URL: `https://syncsphere-hiv6.onrender.com`

I probed both endpoints ~150 times before writing any component code. What the
brief describes and what the API does are not quite the same thing.

| Endpoint | Success | Fail rate |
|---|---|---|
| `/assignment/course-data` | 29/40 | **27.5%** |
| `/assignment/country-code` | 21/40 | **47.5%** |

The brief says "roughly 1 in 3, both endpoints". Course data matches; country
code is closer to 1 in 2. Both endpoints succeeding on a first attempt is only
~38% of page loads, which makes the currency-fallback path the *common* path
rather than an edge case.

Other findings that shaped the code:

- **Failures are random and independent** — no stickiness, no rate limiting, and
  failures return in ~260ms just like successes. So retries work well, and long
  exponential backoff would only make the page feel slow for no benefit.
- **404s are synthetic.** `/openapi.json` is live and shows the 404 and the 500
  are injected by the same handler. Both are retried here; against a real API I
  would retry 5xx only.
- **Error bodies are jokes**: `{"detail":"gg"}`, `{"detail":"FAAAAAAAAAAA"}`,
  `{"detail":"this aint working dawg"}`. They never reach the DOM.
- **CORS is open** (`access-control-allow-origin: *`) and the request is a bare
  GET with no custom headers, so no preflight fires.
- **Every non-GET verb returns 405** — the OpenAPI spec registers them
  explicitly as `*_wrong_method` handlers.
- **The course pool is 10 fixed items**; each response is the first N (5–10) in
  a stable order, so `courseCode` is a reliable React key.

### The prices are not conversions

`pricePaise` and `priceUsdCents` imply an exchange rate of ~50 INR/USD across
all ten courses. The real rate is ~87. They are independent regional prices, so
showing the wrong region's price understates the US price by about 1.7x.

That is why an undetected region shows **both** prices rather than defaulting to
one. Both numbers are true; guessing produces a number that isn't.

---

## Design decisions

**Region is detected once, then locked.** The country endpoint returns IN or US
at random on every call. Retrying a *failure* is safe, but re-asking after a
success could reprice the page under someone who only wanted to reload the grid.
A `useRef` holds the settled value; the retry button re-fetches courses only.

**Four states, and "empty" means one specific thing.** Loading, error, empty,
ready. The empty state is reserved for the API actually returning `[]`. A 200
carrying a non-array, or an array where no course survives validation, routes to
the *error* state instead — reporting "no courses available" when the response is
simply malformed would be a lie, and the error state at least offers a retry.

**Validation is graduated.** A course is dropped if it lacks a `courseCode`
(the React key), a `courseName`, or either price. Missing `description`,
`mainCategory` or `refundable` are cosmetic and degrade gracefully — losing a
whole course over a missing description would be the worse trade. `courseCode`
is also de-duplicated, since duplicate React keys make React reuse the wrong card.

**Prices are validated as finite and non-negative.** `null / 100` is `0`, which
renders as a confident `₹0` — a wrong price that looks legitimate, which is
worse than an obviously broken one.

**Timeouts distinguish slow from hung.** Render's free tier sleeps after ~15
minutes idle, so the first attempt gets 15s and later attempts 6s. A "still
loading" hint appears at 6s so the skeletons are never silently stuck.

**No requests during thumbnail/export renders.** `RenderTarget.hasRestrictions()`
guards both effects, so Framer's static renders don't spend requests on an API
that fails a third of the time.

---

## Property controls

Two on `Courses`, as specified:

| Control | Type |
|---|---|
| Heading | `String` |
| Accent | `Color` |

The accent travels as a registered CSS custom property (`@property`) and the
translucent chip tint is derived with `color-mix()`. Framer's colour control can
return `#RGB`, `#RRGGBBAA`, `rgb()`, `hsl()` or a `var(--token-…)` shared style,
and string-concatenating an alpha suffix onto any of those produces an invalid
value. Registering the property also means an invalid accent falls back to the
default instead of rendering the retry button as white text on transparent.

## Extras

Skeleton loaders, search (name + category), price sorting, a refundable badge,
and a retry button. Search filters already-fetched data — a request per keystroke
against a 1-in-3 failure rate would flicker the section into the error state
mid-word. Sorting follows the displayed currency and copies before sorting, since
`Array.sort` mutates in place.

## Accessibility

A persistent `role="status"` live region announces state changes (a region that
mounts alongside its text is announced unreliably). `:focus-visible` rings on the
retry button and CTA, `aria-hidden` on the decorative skeletons, and the pulse
animation respects `prefers-reduced-motion` — a cold start can otherwise leave it
animating for 30 seconds.

---

## Known gaps

- If courses load instantly but the country call hangs on all four attempts, the
  price area can shimmer for ~35s. Unlikely, but it is the weakest corner.
- I never observed a Render cold start — the 15s first-attempt timeout is
  reasoned from documented behaviour, not measured.
- Tab-order was verified programmatically; a browser extension blocked real
  keyboard testing locally.
- Chip contrast could fall below 4.5:1 if a designer picks a very pale accent.
