# DESIGN.md — SoundHub web

The single source of truth for everything visual in `apps/web`. Tokens and
patterns were taken from a live inspection (computed styles) of the payment
gateway's hosted checkout in its sandbox, plus its published institutional
palette. The gateway's name and logo are never used.

## 1. Principles

1. **Mobile-first.** Design at 375×667 first, then scale up.
2. **The amount leads.** The total is always the most visible element of each step.
3. **Trust through clarity.** Few elements, plain language, explicit states — never a spinner without text.
4. **One primary action per screen.**

## 2. Tokens

Defined once in `src/styles/index.css` under Tailwind v4's `@theme` and used
only through their utility names (`bg-ink`, `text-brand-lime`, …). No raw hex
values in components.

### Color

| Token | Hex | Use |
|---|---|---|
| `ink` | `#2C2A29` | Primary text; primary button background |
| `brand-lime` | `#DFFF61` | Primary button label on `ink`; accents. Never as text on a light background |
| `brand-mint` | `#B0F2AE` | Success backgrounds, chips |
| `brand-forest` | `#00825A` | Success icons and text, links |
| `brand-sky` | `#99D1FC` | Information, focus ring |
| `paper` | `#FAFAFA` | Alternate light background |
| `canvas` | `#F8F8F8` | Page background |
| `surface` | `#FFFFFF` | Panels, cards, inputs |
| `surface-tint` | `#F8FFF8` | Order-summary side panel (mint tint) |
| `text-strong` | `#16181E` | Headings |
| `text` | `#3C3C3C` | Secondary text |
| `border` | `#CACACA` | Inputs, option and product cards |
| `border-subtle` | `#E4E4E4` | Dividers |
| `selected-bg` / `selected-border` | `#EBF6FE` / `#7CB3DC` | Selected option |
| `danger` | `#D93A3A` | Declined, error, test-mode banner |
| `warning` | `#F5A524` | "Payment under review" (with `ink` text) |

Contrast rules (WCAG AA minimum):
- `brand-lime` on `ink` ≈ 12:1 (AAA) — this is the primary button.
- Text on `brand-lime`, `brand-mint`, `brand-sky` or `warning` is always `ink`.
- Status is never conveyed by color alone: always icon + text.

### Typography

Self-hosted with `@fontsource` (no third-party font requests; CSP stays `font-src 'self'`):
- **Manrope** — headings and amounts.
- **Open Sans** — body text, labels and form fields.

| Role | Size / weight | Family |
|---|---|---|
| Amount display | 36 / 700 | Manrope |
| Page title | 24 / 700 | Manrope |
| Section title | 20 / 700 | Manrope |
| Group label | 18 / 400 | Open Sans |
| Body and inputs | 16 / 400 (16 px prevents iOS zoom on focus) | Open Sans |
| Field label | 14 / 400; block title 14 / 700 | Open Sans |
| Micro label | 12 / 700 | Open Sans |
| Button | 16 / 600 | Open Sans |
| Reference / code | 14 / 500 | `ui-monospace` stack |

### Shape, spacing and elevation

- Radius: inputs `6px` · option and product cards `16px` · panels and dialogs `20px` · buttons, chips and badges `9999px` (pill).
- Borders: 1 px. Card shadow: `0 1px 3px rgba(0,0,0,0.04)`. Dialogs and sheets: `0 8px 32px rgba(0,0,0,0.12)`.
- Spacing: 4 px scale. Panel padding 16 px (base) / 32 px (≥ `md`). Field gap 16 px; section gap 24 px.
- Heights: input 44 px · option card 72 px · primary button 56 px.
- Breakpoints: base 320–639 · `sm` 640 · `md` 768 (two columns) · `lg` 1024 · max content width 1040 px.

## 3. Checkout patterns (observed in the gateway's hosted checkout)

1. **Two panels on desktop.** Left: `surface-tint` panel with *what you are paying for*. Right: `surface` panel with the current step. On mobile they stack, with a compact summary on top.
2. **Amount box.** Micro label ("¿Cuánto vas a pagar?") above a bordered box with a success check icon and the amount at 36/700.
3. **Selectable option cards.** 72 px high, radius 16, icon on the left, card-brand logos on the right, chevron. Selected: `selected-bg` + `selected-border`, with an underlined "Cambiar …" link below.
4. **Forms.** Label above the input, placeholder "Ingresa tu …", mobile number with a separate `+57` prefix.
5. **Primary CTA.** Pill, `ink` background with `brand-lime` label and a leading icon. Bottom-right on desktop, full width on mobile. Disabled at 40% opacity until the form is valid.
6. **Test-mode banner.** A `danger` badge "MODO DE PRUEBAS" on a diagonally striped band at the very top.
7. **Trust footer.** Shield icon + "Pago seguro".

## 4. SoundHub screens

| Screen | Pattern |
|---|---|
| Catalog `/` | Grid: 1 column (base), 2 (`sm`), 3 (`lg`). Product card: `surface`, radius 16, 1:1 image, brand, name, price, stock badge ("Agotado" in `danger`). Pill pagination. |
| Product `/products/:id` | Image and details; two columns from `md`. Quantity stepper with 44 px buttons. Primary CTA "Pagar con tarjeta de crédito". |
| Checkout (steps 2–3) | Desktop: two-panel Dialog (left: product × quantity and the amount box; right: forms). Mobile: full-screen. Sections: "Tus datos", "Entrega", "Tarjeta", legal acceptances. Card number shows the brand logo inside the input on the right; MM/AA and CVC side by side; installments in a select. |
| Summary (backdrop) | Mobile: bottom sheet (Drawer). Desktop: Dialog. Breakdown rows, total at 36/700, masked card `•••• 4242`, delivery address, CTA "Pagar $ 392.046". |
| Final status `/transactions/:id` | Large circular icon (approved: `brand-mint` + `brand-forest` · declined/error: `danger` · under review: `warning` with spinner), title, monospace reference, breakdown, CTA "Volver al producto". Wrapped in `aria-live="polite"`. |
| Global | Test-mode banner at the top; trust footer at the bottom. |

## 5. Components (shadcn/ui, copied into `src/components/ui/`)

| Component | Variants / notes |
|---|---|
| `Button` | `primary` (ink + lime, pill), `secondary` (surface + border, pill), `ghost`, `link` (forest, underlined) |
| `Input`, `Select`, `Checkbox`, `Form` | Radius 6, 44 px, 16 px text; errors below the field in `danger` 14 px |
| `Dialog`, `Drawer` | Radius 20; Drawer for mobile summary, Dialog for desktop |
| `Card` | Product card and option card (72 px, selectable) |
| `Badge` | Stock (`brand-mint` / `danger`), test mode (`danger`) |
| `Skeleton` | Product images and lists while loading |

Product-specific components (`ProductCard`, `CardForm`, `SummarySheet`, …)
live in their feature folder and compose these primitives.

## 6. Formats and microcopy

- Money: `formatCop()` from `src/lib/money.ts` → `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })` → "$ 189.990".
- Card: `•••• 4242`. Reference: `TX-20260926-8F3K2Q` in monospace.
- Spanish (Colombia), informal "tú", direct verbs: "Ingresa tu…", "Continuar", "Pagar".
- Errors are specific and actionable ("Revisa el número de la tarjeta"), never just "Error". The UI chooses the message by the API error `code`, not by its text.

## 7. Accessibility

- Touch targets ≥ 44 px; inputs at 16 px.
- Visible focus: 2 px `brand-sky` ring with 2 px offset.
- Every input has a `<label>`; errors are linked with `aria-describedby`.
- Payment status changes are announced through `aria-live`.
- Dialogs and sheets trap focus and close with Esc.

## 8. Icons and images

- Icons: `lucide-react`, stroke 1.5. VISA and MasterCard logos as inline SVG for brand detection.
- Product images: WebP, 1:1, 320/640/960 widths with `srcset`, explicit `width`/`height`, `loading="lazy"` except the main image; skeleton while loading.

## 9. Motion

- 150–200 ms `ease-out`. Sheets slide up; dialogs fade and scale in.
- All transitions are disabled under `prefers-reduced-motion`.

## 10. Out of scope

Dark mode.
