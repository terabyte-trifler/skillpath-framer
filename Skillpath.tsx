import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

/**
 * Skillpath — Hero, Courses and Footer.
 *
 * Three named exports; Framer lists each one separately in the Assets panel.
 * They share the design tokens, the accent stylesheet and the default accent
 * below, which is the reason they live in one file rather than three.
 *
 * Framer reads its @framer* annotations from the comment immediately above a
 * component, so in a multi-export file each one carries its own — see each
 * export below rather than here.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared constants
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://syncsphere-hiv6.onrender.com"
const CACHE_KEY = "skillpath:country"

// Defaults live here so each destructure, the CSS initial-value and the Framer
// property controls can't drift apart.
const DEFAULT_ACCENT = "#4F46E5"

const DEFAULT_HEADLINE = "Learn the skills that actually ship."
const DEFAULT_SUBHEADLINE =
    "Short, practical courses from people who do the work — not lecture about it."
const DEFAULT_BUTTON_LABEL = "Browse courses"
const DEFAULT_BUTTON_LINK = "#courses"

const DEFAULT_HEADING = "Courses built to ship your skills"

const DEFAULT_COMPANY = "Skillpath"
const DEFAULT_LINKS: FooterLink[] = [
    { label: "About", url: "#" },
    { label: "Pricing", url: "#" },
    { label: "Contact", url: "#" },
]

// One palette for all three sections — the main practical win of merging.
const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
const INK = "#111114" // headings
const MUTED = "#5F5F6B" // body copy
const SUBTLE = "#6B6B76" // notices
// #8A8A96 measured 3.27:1 against the canvas — below the 4.5:1 AA floor for
// normal-size text. #6E6E7A is 4.82:1 and still reads as the quietest tone.
const FAINT = "#6E6E7A" // copyright
const LINE = "#ECECF1" // borders
const SURFACE = "#FFFFFF" // cards, hero background
const CANVAS = "#FAFAFB" // section backgrounds

// ─────────────────────────────────────────────────────────────────────────────
// Shared stylesheet
//
// Framer's color control does not always hand back a 6-digit hex. It can return
// #RGB, #RRGGBBAA, rgb(), rgba(), hsl(), or — when a designer picks a shared
// color style — a token such as `var(--token-abc, rgb(79, 70, 229))`. String-
// concatenating an alpha suffix onto any of those produces an invalid value and
// the tint silently disappears. So the accent travels as a custom property and
// the translucent variant is derived by color-mix(), which accepts every CSS
// color form including var() tokens.
// ─────────────────────────────────────────────────────────────────────────────

const stylesheet = `
/**
 * Registering the property gives it a type. Without this, an accent that isn't a
 * valid color (an empty control, a token that fails to resolve) makes every
 * var(--sp-accent) declaration "invalid at computed value time" — which does NOT
 * fall back to the previous declaration, it falls back to unset. The retry button
 * would then be white text on a transparent background: invisible. With a
 * registered initial-value, a bad accent degrades to the default indigo instead.
 */
@property --sp-accent {
    syntax: "<color>";
    inherits: true;
    initial-value: ${DEFAULT_ACCENT};
}

@keyframes skillpath-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .45 } }

/**
 * The pulse lives on a class rather than in the inline style object, because an
 * inline animation cannot be switched off by a media query without !important.
 * Moving it here is what makes the reduced-motion rule below possible at all.
 */
.skillpath-shimmer {
    animation: skillpath-pulse 1.4s ease-in-out infinite;
}

/**
 * A cold start can leave these placeholders pulsing for 30 seconds, so this is
 * not a token gesture: it's a long-running animation nobody asked for. Reduced
 * motion stops it dead — the placeholders stay visible as flat blocks, which
 * still reads as "content is coming", and the live region announces the loading
 * state regardless.
 */
@media (prefers-reduced-motion: reduce) {
    .skillpath-shimmer {
        animation: none;
    }

    .skillpath-cta {
        transition: none;
    }
}

.skillpath-chip {
    /* Fallback first: a browser without color-mix() drops the line it cannot
       parse and keeps this neutral tint, so the chip is never unreadable. */
    background: rgba(127, 127, 127, 0.12);
    background: color-mix(in srgb, var(--sp-accent) 10%, transparent);
    color: var(--sp-accent);
}

.skillpath-retry,
.skillpath-cta {
    background: var(--sp-accent);
}

.skillpath-cta:hover {
    filter: brightness(0.92);
}

/**
 * :focus-visible rather than :focus, so a mouse click doesn't leave a ring
 * behind but keyboard tabbing always shows one. The offset puts the ring
 * outside the button, separated by the page background, which keeps it visible
 * against a button that is itself painted in the accent colour.
 */
/* A text field is always keyboard-relevant, so :focus rather than
   :focus-visible — a click into it should show the ring too. */
.skillpath-search:focus {
    outline: 3px solid var(--sp-accent);
    outline-offset: 2px;
    border-color: transparent;
}

.skillpath-retry:focus-visible,
.skillpath-cta:focus-visible {
    outline: 3px solid var(--sp-accent);
    outline-offset: 3px;
}
`

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Course = {
    courseName: string
    courseCode: string
    description: string
    mainCategory: string
    pricePaise: number
    priceUsdCents: number
    refundable: boolean
}

type CountryCode = "IN" | "US"

// "unknown" is a real variant, not a null that quietly falls through to a default.
type Currency = { kind: "known"; code: CountryCode } | { kind: "unknown" }

type CoursesState =
    | { status: "loading" }
    | { status: "error" }
    | { status: "ok"; data: Course[] }

type FooterLink = {
    label: string
    url: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Transport
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Both price fields are hundredths (paise / cents). The /100 happens in
 * formatPrice and nowhere else.
 *
 * Both formatters pin 2 decimals. The earlier INR setting of min 0 / max 2 was
 * wrong for money: 199950 paise rendered as "₹1,999.5" — a single decimal place,
 * which no currency uses. Every live price happens to be a whole rupee so it
 * never showed, but the formatter was only accidentally right.
 */
const INR = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})
const USD = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})

/**
 * Render's free tier sleeps after ~15 minutes idle, and the first request after
 * that can take 30s+ while the instance wakes. So the first attempt gets a long
 * leash: a slow cold start is a legitimate slow path, not a hang.
 *
 * By the second attempt the instance is either awake (and answers in ~260ms) or
 * truly broken, so later attempts get a much shorter one. Even when we do give
 * up, the attempts have warmed the server — which is why retry usually works.
 */
const TIMEOUT_COLD = 15000
const TIMEOUT_WARM = 6000

// How long the skeletons stay silent before we admit it's taking a while.
const SLOW_HINT_MS = 6000

const delay = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, ms)
        signal.addEventListener(
            "abort",
            () => {
                clearTimeout(t)
                reject(new Error("aborted"))
            },
            { once: true }
        )
    })

/**
 * The API fails ~1 in 3 requests on purpose, on both endpoints. Failures are
 * random and independent, so a plain retry works. Two endpoints need this, so
 * it's a function.
 *
 * We retry 404s as well as 500s: /openapi.json shows both are injected by the
 * same handler, so the 404 is synthetic. Against a real API I'd retry 5xx only.
 */
async function fetchJson<T>(
    path: string,
    attempts: number,
    signal: AbortSignal
): Promise<T> {
    let lastError: unknown
    for (let i = 0; i < attempts; i++) {
        // Failures return in ~260ms and are independent, so an immediate retry
        // has the same odds as a delayed one. Long exponential backoff would
        // only make the page feel broken.
        if (i > 0) await delay(250 * i, signal)
        try {
            // Bare GET — no custom headers, so no CORS preflight. GET is the
            // only method this API accepts; everything else returns 405.
            //
            // Two signals are combined: `signal` cancels on unmount or retry,
            // and the timeout caps a request that never answers. A timeout
            // aborts only the inner signal, so the catch below treats it as an
            // ordinary failure and retries — which is what we want.
            const res = await fetch(BASE + path, {
                signal: AbortSignal.any([
                    signal,
                    AbortSignal.timeout(i === 0 ? TIMEOUT_COLD : TIMEOUT_WARM),
                ]),
            })
            // The error body is a joke string ("FAAAAAAAAAAA"). It never reaches
            // the DOM.
            if (!res.ok) throw new Error("HTTP " + res.status)
            return (await res.json()) as T
        } catch (err) {
            if (signal.aborted) throw err // superseded or unmounted: don't retry
            lastError = err
        }
    }
    throw lastError
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage — the only two functions in the file that touch sessionStorage.
// It can throw in a sandboxed iframe, which is where Framer renders, so both
// sides swallow the failure and simply behave as though the cache were empty.
// ─────────────────────────────────────────────────────────────────────────────

function readCachedCountry(): CountryCode | null {
    try {
        const v = sessionStorage.getItem(CACHE_KEY)
        return v === "IN" || v === "US" ? v : null
    } catch {
        return null
    }
}

function writeCachedCountry(code: CountryCode): void {
    try {
        sessionStorage.setItem(CACHE_KEY, code)
    } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — no storage, no network. Same input, same output, every time.
// ─────────────────────────────────────────────────────────────────────────────

/** Pulls a usable country code out of an unvalidated response body. */
function readCountryCode(body: unknown): CountryCode | null {
    const code =
        typeof body === "object" && body !== null
            ? (body as Record<string, unknown>).country_code
            : undefined
    // Comparing against the literals narrows `unknown` to the union by itself.
    return code === "IN" || code === "US" ? code : null
}

/** Shapes a code — or the absence of one — into the state the UI renders from. */
function asCurrency(code: CountryCode | null): Currency {
    return code ? { kind: "known", code } : { kind: "unknown" }
}

/**
 * A price must be a real, non-negative number. This rejects null, undefined, NaN
 * and negatives — null is the dangerous one, because null/100 is 0 and renders
 * as a confident "₹0", which reads as "this course is free" rather than as an
 * error.
 *
 * 0 itself is allowed: a genuinely free course is valid data, not a broken field.
 */
const isPrice = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= 0

/**
 * Both price fields are required, not just the one we happen to be showing: the
 * currency is decided at render time, and the unknown-region fallback needs both.
 *
 * courseCode is required because it is the React key, and courseName because a
 * card with no title is not a card. Everything else is cosmetic and defaulted at
 * render — losing a whole course over a missing description would be a worse
 * trade.
 *
 * Numeric strings ("199900") are rejected on purpose. Same principle as the
 * currency: when the data isn't what we expect, don't guess at it.
 */
const isRenderable = (c: unknown): c is Course => {
    if (typeof c !== "object" || c === null) return false
    // Reading through a keyed record keeps the field names checked:
    // `v.courseNam` is a compile error here, whereas `any` would have swallowed
    // it silently — in the one function whose entire job is catching bad data.
    const v = c as Partial<Record<keyof Course, unknown>>
    return (
        typeof v.courseCode === "string" &&
        v.courseCode !== "" &&
        typeof v.courseName === "string" &&
        v.courseName !== "" &&
        isPrice(v.pricePaise) &&
        isPrice(v.priceUsdCents)
    )
}

type SortOrder = "default" | "asc" | "desc"

/**
 * Sorting has to follow the currency actually on screen. The two price lists
 * happen to rank identically on today's data, but they are independent regional
 * prices — leaning on that coincidence is the same mistake as assuming every
 * price is a whole rupee. When the region is unknown we sort by paise:
 * arbitrary, but deterministic, so the order can't shuffle between renders.
 */
const priceOf = (c: Course, currency: Currency | null): number =>
    currency?.kind === "known" && currency.code === "US"
        ? c.priceUsdCents
        : c.pricePaise

/**
 * The two price fields are regional prices, not conversions (implied rate ~50
 * against a real ~87), so guessing a region understates the US price by ~1.7x.
 * When we don't know the region we show both real prices rather than pick a
 * wrong one.
 */
function formatPrice(course: Course, currency: Currency): string {
    const inr = INR.format(course.pricePaise / 100)
    const usd = USD.format(course.priceUsdCents / 100)
    if (currency.kind === "known") return currency.code === "IN" ? inr : usd
    return inr + " · " + usd
}

/**
 * Visually hidden but still announced. Not `display: none` and not
 * `visibility: hidden` — both of those remove the element from the
 * accessibility tree, which would defeat the point of a live region.
 */
const srOnly: CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    border: 0,
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────────────────────────

type HeroProps = {
    headline?: string
    subheadline?: string
    buttonLabel?: string
    buttonLink?: string
    accent?: string
    style?: CSSProperties // Framer passes layout styles in through this
}

/**
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 560
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */
export function Hero(props: HeroProps) {
    const {
        headline = DEFAULT_HEADLINE,
        subheadline = DEFAULT_SUBHEADLINE,
        buttonLabel = DEFAULT_BUTTON_LABEL,
        buttonLink = DEFAULT_BUTTON_LINK,
        accent = DEFAULT_ACCENT,
        style,
    } = props

    /**
     * A destructuring default only fires for `undefined`. Framer's Link control
     * can also hand back `null` or `""` once a designer clears the field, and
     * `null.startsWith(...)` would throw — taking the entire hero blank from a
     * cleared property control. So the value is re-checked rather than trusted.
     */
    const link =
        typeof buttonLink === "string" && buttonLink.trim() !== ""
            ? buttonLink
            : DEFAULT_BUTTON_LINK

    // An in-page anchor stays in the tab; a real destination opens in a new one.
    const isAnchor = link.startsWith("#")

    return (
        <section
            style={
                {
                    ...heroStyles.section,
                    ...style,
                    "--sp-accent": accent,
                } as CSSProperties
            }
        >
            <style>{stylesheet}</style>
            <div style={heroStyles.inner}>
                <h1 style={heroStyles.headline}>{headline}</h1>
                <p style={heroStyles.sub}>{subheadline}</p>
                <a
                    className="skillpath-cta"
                    style={heroStyles.cta}
                    href={link}
                    target={isAnchor ? undefined : "_blank"}
                    rel={isAnchor ? undefined : "noopener noreferrer"}
                >
                    {buttonLabel}
                </a>
            </div>
        </section>
    )
}

const heroStyles: Record<string, CSSProperties> = {
    section: {
        width: "100%",
        padding: "clamp(72px, 12vw, 132px) clamp(16px, 4vw, 24px)",
        background: SURFACE,
        boxSizing: "border-box",
        fontFamily: FONT,
    },
    // Narrower than the 1200px grid below it: long headlines are hard to read
    // edge-to-edge, and the contrast gives the page a centre of gravity.
    inner: { maxWidth: 720, margin: "0 auto", textAlign: "center" },
    headline: {
        margin: 0,
        fontSize: "clamp(34px, 6vw, 60px)",
        lineHeight: 1.08,
        letterSpacing: "-0.03em",
        fontWeight: 600,
        color: INK,
    },
    sub: {
        margin: "18px auto 0",
        maxWidth: 560,
        fontSize: "clamp(16px, 2vw, 18.5px)",
        lineHeight: 1.55,
        color: MUTED,
    },
    cta: {
        display: "inline-block",
        marginTop: 32,
        padding: "14px 28px",
        borderRadius: 10,
        color: SURFACE,
        fontSize: 16,
        fontWeight: 600,
        textDecoration: "none",
        transition: "filter 120ms ease",
    },
}

// ─────────────────────────────────────────────────────────────────────────────
// Courses — the section that talks to the API
// ─────────────────────────────────────────────────────────────────────────────

type CoursesProps = {
    heading?: string
    accent?: string
    style?: CSSProperties // Framer passes layout styles in through this
}

/**
 * Last line of defence against a blank section.
 *
 * Every known failure is already handled as state — a render error would have
 * to be something unforeseen. But React unmounts the whole subtree when one
 * escapes, so without a boundary "unforeseen" means the section silently
 * disappears from the page. This turns that into the same error card the
 * network path already uses, with a control that remounts and refetches.
 *
 * It has to be a class: getDerivedStateFromError has no hook equivalent.
 */
class Boundary extends React.Component<
    {
        accent?: string
        style?: CSSProperties
        children?: React.ReactNode
    },
    { failed: boolean }
> {
    state = { failed: false }

    static getDerivedStateFromError() {
        return { failed: true }
    }

    componentDidCatch(error: unknown) {
        // Dev-facing. The visitor sees the card below, never this.
        console.warn("[Skillpath] render error caught by boundary:", error)
    }

    render() {
        if (!this.state.failed) return this.props.children
        return (
            <section
                style={
                    {
                        ...courseStyles.section,
                        ...this.props.style,
                        "--sp-accent": this.props.accent ?? DEFAULT_ACCENT,
                    } as CSSProperties
                }
            >
                <style>{stylesheet}</style>
                <div style={courseStyles.inner}>
                    <div style={courseStyles.state} role="status">
                        <p style={courseStyles.stateTitle}>
                            Something went wrong in this section.
                        </p>
                        <p style={courseStyles.stateBody}>
                            The rest of the page is unaffected.
                        </p>
                        <button
                            onClick={() => this.setState({ failed: false })}
                            className="skillpath-retry"
                            style={courseStyles.retry}
                        >
                            Reload section
                        </button>
                    </div>
                </div>
            </section>
        )
    }
}

/**
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 900
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */
export function Courses(props: CoursesProps) {
    return (
        <Boundary accent={props.accent} style={props.style}>
            <CoursesSection {...props} />
        </Boundary>
    )
}

function CoursesSection(props: CoursesProps) {
    const {
        heading = DEFAULT_HEADING,
        accent = DEFAULT_ACCENT,
        style,
    } = props

    /**
     * Framer renders components for thumbnails and image exports as well as for
     * the canvas. Those targets can't wait on async work, and firing requests
     * from them would be actively harmful here: the API fails ~1 in 3, so a
     * thumbnail would regularly bake in the error state, and every re-export
     * would spend requests on a flaky free-tier server for a picture nobody
     * fetches data for.
     *
     * hasRestrictions() is true for exactly those targets. There we skip the
     * network and let the component sit in its loading state, so the thumbnail
     * shows the card layout as skeletons — the real shape, with no invented
     * courses. Canvas and preview still fetch live data, because a designer
     * styling this section should be looking at the real thing.
     */
    const staticRender = RenderTarget.hasRestrictions()

    const [courses, setCourses] = useState<CoursesState>({ status: "loading" })
    const [currency, setCurrency] = useState<Currency | null>(null) // null = detecting
    const [nonce, setNonce] = useState(0)
    const [slow, setSlow] = useState(false) // "still working" hint on a cold start
    const [query, setQuery] = useState("")
    const [sort, setSort] = useState<SortOrder>("default")
    const settled = useRef<Currency | null>(null)

    // Region: detected once, then locked. The endpoint flips IN/US at random on
    // every call, so re-asking could change prices under someone who only wanted
    // to reload the grid. Retrying a *failure* is safe (there's no value to
    // contradict); re-asking after a success is not.
    useEffect(() => {
        if (staticRender || settled.current) return
        const ac = new AbortController()
        fetchJson<unknown>(
            "/assignment/country-code",
            4, // fails ~47% vs ~27% for courses, so one more attempt
            ac.signal
        )
            .then((r) => {
                const fresh = readCountryCode(r)
                if (fresh) writeCachedCountry(fresh)
                // A fresh detection beats the cache; the cache only fills a gap.
                const c = asCurrency(fresh ?? readCachedCountry())
                if (c.kind === "known") settled.current = c
                setCurrency(c)
            })
            .catch(() => {
                if (!ac.signal.aborted)
                    setCurrency(asCurrency(readCachedCountry()))
            })
        return () => ac.abort()
    }, [nonce, staticRender])

    // Courses: re-fetchable. This is what the retry button actually retries.
    useEffect(() => {
        if (staticRender) return
        const ac = new AbortController()
        setCourses({ status: "loading" })
        setSlow(false)
        const hint = setTimeout(() => setSlow(true), SLOW_HINT_MS)
        // Declared unknown, not Course[]: fetchJson casts whatever JSON arrives,
        // so claiming Course[] here would be a promise the API never made. The
        // filter below is what actually produces Course[].
        fetchJson<unknown>("/assignment/course-data", 3, ac.signal)
            .then((data) => {
                // The empty state means one specific thing: the API told us there
                // are zero courses. A 200 carrying something that isn't a list
                // never said that — so falling through to "No courses available
                // right now" would report an empty catalogue when the truth is a
                // broken response. Throwing routes it to the error state, which
                // is honest and offers a retry that might actually help.
                if (!Array.isArray(data)) {
                    throw new Error("Malformed response: expected an array")
                }

                const raw: unknown[] = data
                // isRenderable proves courseCode is a non-empty string, but not
                // that it is unique — and uniqueness is the part that matters for
                // a React key. Duplicates would make React reuse the wrong card
                // on re-render, so the first occurrence wins.
                const seen = new Set<string>()
                const clean = raw.filter(isRenderable).filter((c) => {
                    if (seen.has(c.courseCode)) return false
                    seen.add(c.courseCode)
                    return true
                })
                if (clean.length < raw.length) {
                    // Dev-facing only: a dropped course is worth seeing.
                    console.warn(
                        `[Skillpath] dropped ${raw.length - clean.length} course(s): invalid fields or duplicate courseCode`
                    )
                }

                // Same reasoning one level down: if courses arrived and not one
                // survived validation, that is bad data rather than an empty
                // catalogue. Only a genuinely empty list earns the empty state.
                if (raw.length > 0 && clean.length === 0) {
                    throw new Error("Malformed response: no usable courses")
                }

                setCourses({ status: "ok", data: clean })
            })
            .catch(() => {
                if (!ac.signal.aborted) setCourses({ status: "error" })
            })
            .finally(() => clearTimeout(hint))
        return () => {
            ac.abort()
            clearTimeout(hint)
        }
    }, [nonce, staticRender])

    const retry = () => setNonce((n) => n + 1)

    /**
     * Filters what we already have. It deliberately does not re-fetch: the API
     * fails ~1 in 3, so a request per keystroke would flicker the whole section
     * into the error state while somebody is still typing.
     *
     * courseName is safe to lowercase directly — isRenderable guarantees it is a
     * non-empty string. mainCategory is not validated (it is cosmetic, and a
     * course isn't dropped for missing one), so it has to be checked here or a
     * category-less course would throw on the first keystroke.
     */
    const visible = useMemo(() => {
        if (courses.status !== "ok") return []
        const q = query.trim().toLowerCase()
        const filtered =
            q === ""
                ? courses.data
                : courses.data.filter((c) => {
                      const name = c.courseName.toLowerCase()
                      const category =
                          typeof c.mainCategory === "string"
                              ? c.mainCategory.toLowerCase()
                              : ""
                      return name.includes(q) || category.includes(q)
                  })

        if (sort === "default") return filtered
        // Copy first: when the query is empty `filtered` *is* courses.data, and
        // sort() reorders in place — this would quietly mutate state.
        return [...filtered].sort((a, b) =>
            sort === "asc"
                ? priceOf(a, currency) - priceOf(b, currency)
                : priceOf(b, currency) - priceOf(a, currency)
        )
    }, [courses, query, sort, currency])

    /**
     * One live region that is always mounted, whose text changes with the state.
     * A region that mounts at the same moment its text appears is announced
     * unreliably across screen readers, so the element persists and only its
     * contents change — that is the case assistive tech handles consistently.
     *
     * Polite, not assertive: a section failing to load is worth hearing at the
     * next pause, not worth interrupting whatever is being read right now.
     */
    const statusMessage =
        courses.status === "loading"
            ? "Loading courses."
            : courses.status === "error"
              ? "Couldn’t load courses. Use the try again button to retry."
              : courses.data.length === 0
                ? "No courses available."
                : visible.length === 0
                  ? `No courses match ${query.trim()}.`
                  : `${visible.length} course${
                        visible.length === 1 ? "" : "s"
                    } ${query.trim() === "" ? "loaded" : "found"}.`

    return (
        <section
            // Target for the hero's "Browse courses" anchor.
            id="courses"
            // Naming the section promotes it to a region landmark, so screen
            // reader users can jump straight to it.
            aria-labelledby="skillpath-courses-heading"
            style={
                {
                    ...courseStyles.section,
                    ...style,
                    "--sp-accent": accent,
                } as CSSProperties
            }
        >
            <style>{stylesheet}</style>
            <div style={courseStyles.inner}>
                {/* role="status" implies aria-live="polite"; both are stated so
                    older assistive tech that only honours one still gets it. */}
                <p role="status" aria-live="polite" style={srOnly}>
                    {statusMessage}
                </p>

                <header style={courseStyles.header}>
                    <h2
                        id="skillpath-courses-heading"
                        style={courseStyles.heading}
                    >
                        {heading}
                    </h2>
                    {courses.status === "ok" && currency?.kind === "unknown" && (
                        <p style={courseStyles.notice}>
                            Showing both currencies — we couldn’t detect your
                            region.
                        </p>
                    )}
                </header>

                {/* Only offered once there is something to search — a search box
                    above an error or an empty catalogue is furniture, not help. */}
                {courses.status === "ok" && courses.data.length > 0 && (
                        <div style={courseStyles.controls}>
                            <input
                                type="search"
                                className="skillpath-search"
                                style={courseStyles.search}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search courses"
                                aria-label="Search courses by name or category"
                            />
                            <select
                                className="skillpath-search"
                                style={courseStyles.sort}
                                value={sort}
                                onChange={(e) =>
                                    setSort(e.target.value as SortOrder)
                                }
                                aria-label="Sort courses"
                            >
                                <option value="default">Sort: featured</option>
                                <option value="asc">Price: low to high</option>
                                <option value="desc">Price: high to low</option>
                            </select>
                        </div>
                    )}

                {courses.status === "loading" && (
                    <>
                        {slow && (
                            <p style={courseStyles.notice}>
                                Still loading — the server may be waking up.
                            </p>
                        )}
                        <Skeletons />
                    </>
                )}

                {courses.status === "error" && (
                    <div style={courseStyles.state}>
                        <p style={courseStyles.stateTitle}>
                            We couldn’t load the courses.
                        </p>
                        <p style={courseStyles.stateBody}>
                            The connection dropped on the way. It’s usually
                            temporary.
                        </p>
                        <button
                            onClick={retry}
                            className="skillpath-retry"
                            style={courseStyles.retry}
                        >
                            Try again
                        </button>
                    </div>
                )}

                {courses.status === "ok" && courses.data.length === 0 && (
                    <div style={courseStyles.state}>
                        <p style={courseStyles.stateTitle}>
                            No courses available right now.
                        </p>
                        <p style={courseStyles.stateBody}>
                            New cohorts are added regularly — check back soon.
                        </p>
                    </div>
                )}

                {/* A different state with different copy, on purpose. "No courses
                    available" would be a lie here: the catalogue is full, the
                    filter is just too narrow — and unlike the empty catalogue,
                    this one the visitor can actually do something about. */}
                {courses.status === "ok" &&
                    courses.data.length > 0 &&
                    visible.length === 0 && (
                        <div style={courseStyles.state}>
                            <p style={courseStyles.stateTitle}>
                                No courses match “{query.trim()}”.
                            </p>
                            <p style={courseStyles.stateBody}>
                                Try a different word, or browse everything.
                            </p>
                            <button
                                onClick={() => setQuery("")}
                                className="skillpath-retry"
                                style={courseStyles.retry}
                            >
                                Clear search
                            </button>
                        </div>
                    )}

                {courses.status === "ok" && visible.length > 0 && (
                    <div style={courseStyles.grid}>
                        {visible.map((course) => (
                            <CourseCard
                                // Stable id; an index would remount cards when
                                // the count changes between fetches.
                                key={course.courseCode}
                                course={course}
                                currency={currency}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    )
}

function CourseCard({
    course,
    currency,
}: {
    course: Course
    currency: Currency | null
}) {
    // Cosmetic fields are defaulted rather than required, so one missing string
    // can't cost a learner a whole course. Empty ones are dropped, not rendered
    // as an empty box with leftover spacing.
    const category =
        typeof course.mainCategory === "string" ? course.mainCategory.trim() : ""
    const description =
        typeof course.description === "string" ? course.description.trim() : ""
    const hasChips = category !== "" || course.refundable === true

    return (
        <article style={courseStyles.card}>
            {hasChips && (
                <div style={courseStyles.chipRow}>
                    {category !== "" && (
                        <span className="skillpath-chip" style={courseStyles.chip}>
                            {category}
                        </span>
                    )}
                    {course.refundable === true && (
                        <span style={courseStyles.refund}>Refundable</span>
                    )}
                </div>
            )}

            <h3 style={courseStyles.name}>{course.courseName}</h3>
            {description !== "" && (
                <p style={courseStyles.desc}>{description}</p>
            )}

            <div style={courseStyles.priceRow}>
                {currency === null ? (
                    <span
                        aria-hidden="true"
                        className="skillpath-shimmer"
                        style={{ ...courseStyles.shimmer, width: 92, height: 22 }}
                    />
                ) : (
                    <span style={courseStyles.price}>
                        {formatPrice(course, currency)}
                    </span>
                )}
            </div>
        </article>
    )
}

function Skeletons() {
    // The count varies 5–10, so this is a placeholder shape, not a promise of
    // how many cards are coming.
    return (
        // Decorative: the live region already announces the loading state, and
        // six empty articles would otherwise be read out as six empty articles.
        <div style={courseStyles.grid} aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
                <article key={i} style={courseStyles.card}>
                    <span
                        className="skillpath-shimmer"
                        style={{ ...courseStyles.shimmer, width: 96, height: 22 }}
                    />
                    <span
                        className="skillpath-shimmer"
                        style={{ ...courseStyles.shimmer, width: "70%", height: 20, marginTop: 14 }}
                    />
                    <span
                        className="skillpath-shimmer"
                        style={{ ...courseStyles.shimmer, width: "100%", height: 13, marginTop: 12 }}
                    />
                    <span
                        className="skillpath-shimmer"
                        style={{ ...courseStyles.shimmer, width: "85%", height: 13, marginTop: 7 }}
                    />
                    <span
                        className="skillpath-shimmer"
                        style={{ ...courseStyles.shimmer, width: 80, height: 24, marginTop: 20 }}
                    />
                </article>
            ))}
        </div>
    )
}

const courseStyles: Record<string, CSSProperties> = {
    section: {
        width: "100%",
        padding: "clamp(56px, 8vw, 80px) clamp(16px, 4vw, 24px)",
        background: CANVAS,
        boxSizing: "border-box",
        fontFamily: FONT,
    },
    // Caps the grid at 3 columns on desktop without a media query.
    inner: { maxWidth: 1200, margin: "0 auto" },
    header: { marginBottom: 20 },
    // Wraps to its own line on narrow screens without a breakpoint.
    controls: {
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        marginBottom: 32,
    },
    search: {
        flex: "1 1 220px",
        maxWidth: 340,
        padding: "11px 14px",
        fontSize: 15,
        fontFamily: "inherit",
        color: INK,
        background: SURFACE,
        border: `1px solid ${LINE}`,
        borderRadius: 10,
        boxSizing: "border-box",
    },
    sort: {
        // A select is sized by its widest option, so it needs an explicit floor
        // of 0 and a 100% ceiling to shrink instead of spilling out of the row.
        flex: "0 1 auto",
        minWidth: 0,
        maxWidth: "100%",
        padding: "11px 14px",
        fontSize: 15,
        fontFamily: "inherit",
        color: INK,
        background: SURFACE,
        border: `1px solid ${LINE}`,
        borderRadius: 10,
        cursor: "pointer",
        boxSizing: "border-box",
    },
    heading: {
        margin: 0,
        fontSize: "clamp(28px, 4vw, 40px)",
        lineHeight: 1.15,
        letterSpacing: "-0.02em",
        color: INK,
        fontWeight: 600,
    },
    notice: { margin: "10px 0 0", fontSize: 14, color: SUBTLE },
    /**
     * auto-fill + a 300px floor gives 3 / 2 / 1 columns at desktop / tablet /
     * mobile and every width in between, with no breakpoints and no assumption
     * about how many cards arrive.
     *
     * The floor is min(300px, 100%), not a bare 300px: a bare floor is a hard
     * minimum, so on a 320px phone the 300px track plus 48px of padding
     * overflowed the viewport by 28px and the page scrolled sideways. min() lets
     * the track shrink below 300px once the container itself is narrower, which
     * is the only case it changes.
     */
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
        gap: 20,
        alignItems: "stretch",
    },
    card: {
        display: "flex",
        flexDirection: "column",
        // A grid item's default min-width is auto, so its min-content size — one
        // very long unbroken word — can force the track wider than the container
        // and scroll the whole page sideways. This lets the track actually shrink.
        minWidth: 0,
        background: SURFACE,
        border: `1px solid ${LINE}`,
        borderRadius: 16,
        padding: 22,
        height: "100%",
        boxSizing: "border-box",
    },
    chipRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 },
    chip: {
        overflowWrap: "anywhere",
        fontSize: 12,
        fontWeight: 600,
        padding: "5px 10px",
        borderRadius: 999,
        letterSpacing: "0.01em",
    },
    refund: {
        fontSize: 12,
        fontWeight: 600,
        padding: "5px 10px",
        borderRadius: 999,
        color: "#186A3B",
        background: "#E7F6EC",
    },
    name: {
        // `anywhere` rather than `break-word`: both wrap a long word, but only
        // `anywhere` also shrinks the min-content contribution that the grid
        // track measures. Course names are API data — a URL or a long compound
        // word would otherwise overflow the card.
        overflowWrap: "anywhere",
        margin: "0 0 8px",
        fontSize: 19,
        lineHeight: 1.3,
        fontWeight: 600,
        color: INK,
        letterSpacing: "-0.01em",
    },
    // Descriptions run 107–132 chars, so this genuinely truncates at card width.
    desc: {
        overflowWrap: "anywhere",
        margin: 0,
        fontSize: 14.5,
        lineHeight: 1.55,
        color: MUTED,
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
    },
    // marginTop:auto pins the price to the bottom so cards align on a row of
    // mixed heights.
    priceRow: { marginTop: "auto", paddingTop: 20 },
    price: {
        fontSize: 20,
        fontWeight: 650,
        color: INK,
        letterSpacing: "-0.01em",
    },
    state: {
        textAlign: "center",
        padding: "64px 24px",
        background: SURFACE,
        border: `1px solid ${LINE}`,
        borderRadius: 16,
    },
    stateTitle: {
        // Interpolates the search query, i.e. arbitrary visitor input.
        overflowWrap: "anywhere",
        margin: "0 0 6px",
        fontSize: 17,
        fontWeight: 600,
        color: INK,
    },
    stateBody: { margin: 0, fontSize: 14.5, color: SUBTLE },
    retry: {
        marginTop: 20,
        border: "none",
        color: SURFACE,
        fontSize: 15,
        fontWeight: 600,
        padding: "11px 22px",
        borderRadius: 10,
        cursor: "pointer",
        fontFamily: "inherit",
    },
    // The pulse itself is applied by the .skillpath-shimmer class, not here —
    // see the stylesheet for why.
    shimmer: {
        display: "block",
        background: LINE,
        borderRadius: 6,
    },
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────────────────────

type FooterProps = {
    company?: string
    links?: FooterLink[]
    style?: CSSProperties // Framer passes layout styles in through this
}

/**
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 160
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */
export function Footer(props: FooterProps) {
    const { company, links = DEFAULT_LINKS, style } = props

    // Same reason as the hero's link: a destructuring default only fires for
    // `undefined`, and a cleared Framer text field can arrive as null or "".
    // Without this, the notice reads "© 2026 . All rights reserved."
    const name =
        typeof company === "string" && company.trim() !== ""
            ? company
            : DEFAULT_COMPANY

    // Array controls can hand back holes or half-filled rows while a designer is
    // still typing, so a link needs a label before it earns a place in the markup.
    const visible = (links ?? []).filter(
        (l): l is FooterLink =>
            !!l && typeof l.label === "string" && l.label.trim() !== ""
    )

    // Computed at render, so the notice can't quietly go stale next January.
    const year = new Date().getFullYear()

    return (
        <footer style={{ ...footerStyles.footer, ...style }}>
            <div style={footerStyles.inner}>
                <nav aria-label="Footer" style={footerStyles.links}>
                    {visible.map((link, i) => (
                        <a
                            // Labels are editable and can repeat mid-edit, so the
                            // index is the only stable identity a link has here.
                            key={i}
                            href={typeof link.url === "string" ? link.url : "#"}
                            style={footerStyles.link}
                        >
                            {link.label}
                        </a>
                    ))}
                </nav>
                <p style={footerStyles.copyright}>
                    © {year} {name}. All rights reserved.
                </p>
            </div>
        </footer>
    )
}

const footerStyles: Record<string, CSSProperties> = {
    footer: {
        width: "100%",
        padding: "clamp(32px, 5vw, 44px) clamp(16px, 4vw, 24px)",
        background: CANVAS,
        borderTop: `1px solid ${LINE}`,
        boxSizing: "border-box",
        fontFamily: FONT,
    },
    // Row on desktop, stacked on narrow screens — flexWrap does it without a
    // breakpoint.
    inner: {
        maxWidth: 1200,
        margin: "0 auto",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
    },
    links: { display: "flex", flexWrap: "wrap", gap: 24 },
    link: {
        fontSize: 14.5,
        color: MUTED,
        textDecoration: "none",
    },
    copyright: {
        margin: 0,
        fontSize: 14.5,
        color: FAINT,
    },
}

// ─────────────────────────────────────────────────────────────────────────────
// Property controls
// ─────────────────────────────────────────────────────────────────────────────

addPropertyControls(Hero, {
    headline: {
        type: ControlType.String,
        title: "Headline",
        defaultValue: DEFAULT_HEADLINE,
        displayTextArea: true,
    },
    subheadline: {
        type: ControlType.String,
        title: "Subheadline",
        defaultValue: DEFAULT_SUBHEADLINE,
        displayTextArea: true,
    },
    buttonLabel: {
        type: ControlType.String,
        title: "Button",
        defaultValue: DEFAULT_BUTTON_LABEL,
    },
    buttonLink: {
        type: ControlType.Link,
        title: "Button link",
        defaultValue: DEFAULT_BUTTON_LINK,
    },
    accent: {
        type: ControlType.Color,
        title: "Accent",
        defaultValue: DEFAULT_ACCENT,
    },
})

addPropertyControls(Courses, {
    heading: {
        type: ControlType.String,
        title: "Heading",
        defaultValue: DEFAULT_HEADING,
    },
    accent: {
        type: ControlType.Color,
        title: "Accent",
        defaultValue: DEFAULT_ACCENT,
    },
})

addPropertyControls(Footer, {
    links: {
        type: ControlType.Array,
        title: "Links",
        control: {
            type: ControlType.Object,
            controls: {
                label: { type: ControlType.String, title: "Label" },
                url: { type: ControlType.Link, title: "URL" },
            },
        },
        defaultValue: DEFAULT_LINKS,
    },
    company: {
        type: ControlType.String,
        title: "Company",
        defaultValue: DEFAULT_COMPANY,
    },
})
