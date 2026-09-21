# Photobooth Design Playbook

## Scope And Authority

Use this guide before planning, implementing or reviewing photobooth layouts,
components, styling, user-facing copy or visual tests. It translates the six
rough screenshots supplied on 2026-09-21 into reusable design guidance, not a
pixel-perfect specification or a verified official Bouvet brand manual.

The [implementation plan](./implementation-plan.md) owns the product decisions,
milestone boundaries and unresolved gates until its planned product playbook
exists. This guide owns their visual presentation. Read the relevant technical
playbooks for camera, generation and persistence behavior; screenshots do not
override privacy, accessibility, security or approved product requirements.
Raise unresolved conflicts rather than silently selecting a different behavior.

This is documentation for future UI work, not permission to start implementing
the app. In particular, the approved three-second countdown still needs alignment
with the older camera guide during M0. Do not infer a fifth route from a mockup.

The original screenshot binaries are not currently stored in this repository.
The reference descriptions below are the durable handoff; future sessions must
not assume they can retrieve chat attachments. When the originals are available,
store them under `docs/design-references/`, link them here and compare against
them. Do not fabricate screenshots, image links or claimed visual comparisons.

## Visual Character

- Build a usable event experience, not a marketing landing page or dashboard.
  Keep each screen focused on one decision and make the people/image the main
  visual element.
- Use a warm off-white canvas, near-black type, restrained red actions and rich
  theme imagery. Avoid dark-mode, purple-gradient or heavily tinted alternatives.
- Place the approved Bouvet logo at the upper left. Optional event identification
  sits quietly at the upper right and comes from configuration. Neither the
  mockup's event name nor its red dot implies a live connection status.
- Give the active task a strong, left-aligned heading, a short theme/context label
  when useful and concise supporting copy. Keep typography consistent across
  capture, review, generation, result and overview states.
- Use thin horizontal rules to separate the footer/navigation from content.
  Keep page sections unframed. Cards are for repeated theme choices and genuinely
  framed tools such as QR/actions, not nested containers around whole sections.
- Background arcs, construction lines and small dots may echo the screenshots
  near an outer corner. Keep them low-contrast, sparse, noninteractive and hidden
  from assistive technology. Never place decoration over faces, text or the QR.
  No glow blobs, bokeh, heavy shadows or full-page decorative illustration.
- Treat the rounded outer screenshot corners as presentation framing, not a
  requirement to clip the entire viewport or introduce black browser margins.

## Component Reuse

Before adding UI, check `apps/web/app/components` for an existing component to
reuse or extend. Shared controls and repeated patterns belong there, not in
copied page markup. Use small typed props, slots and variants for genuine
differences, keeping styling and accessible behavior consistent across screens.
Extract shared browser behavior into `apps/web/app/composables` when it has
multiple consumers; keep page-specific workflow state with its owner.

Create a shared component when a pattern is actually repeated, such as a button,
theme choice or media region. Do not build speculative components or a generic
framework for one-off layouts. Fix shared behavior in its owning component and
check affected consumers rather than patching each page separately.

## Starting Tokens

Only the primary accent is specified by the product brief. The other values are
implementation starting points inferred from the references, not sampled brand
values.

When the first UI milestone begins, create
`apps/web/app/assets/css/tokens.css` as the single source of shared color and size
tokens. Define CSS custom properties under `:root` and register the stylesheet
once through Nuxt's global `css` configuration. This is a planned location, not
an existing file or permission to implement it during documentation work.

Include semantic colors, spacing, typography sizes, radii, control dimensions
and reusable layout sizes. Components consume tokens such as
`var(--color-action-primary)`, `var(--space-4)` and `var(--control-height)`;
do not duplicate hex values or shared size literals in page/component styles.
Consolidate existing shared values there when adopting it, rather than keeping
a second palette or scale in the app shell. Keep responsive token-value overrides
in the same file and component-specific layout rules with their components.

Tokenize reusable design decisions, not every CSS value: `0`, `100%`, grid tracks
and genuinely one-off layout relationships need not become global tokens.
Prefer an existing semantic token before adding another; a shared visual change
should be made once and checked across its consumers.

| Role         | Starting value                                           | Usage                                                                 |
| ------------ | -------------------------------------------------------- | --------------------------------------------------------------------- |
| Brand accent | `#EE2950`                                                | Selection markers, large accents and decorative details.              |
| Action red   | `#C9143B`                                                | Filled buttons with white normal-size labels; verify actual contrast. |
| Canvas       | `#F7F5F2`                                                | Warm light page background, not a saturated beige theme.              |
| Surface      | `#FFFFFF`                                                | Theme details and QR/action tool.                                     |
| Text         | `#171717`                                                | Headings, body text and outlined actions.                             |
| Muted text   | `#62605E`                                                | Supporting copy and secondary metadata.                               |
| Divider      | `#D8D3D0`                                                | Decorative separators, not the sole control/focus boundary.           |
| Spacing      | `4, 8, 12, 16, 24, 32, 48` px                            | Consistent gaps and padding.                                          |
| Page gutter  | `48px` wide, `24px` medium, `16px` narrow                | Responsive discrete values with safe-area insets where needed.        |
| Radius       | `8px` cards/media; pill-shaped primary/secondary actions | No nested rounded cards.                                              |
| Touch target | At least `48px` in each interactive dimension            | Includes cancel, navigation and icon-only controls.                   |

Use white on the darker action red for small labels. Do not assume white small
text on `#EE2950` is accessible merely because it appears in the mockups. Test
rendered contrast, including focus, selection, outlined borders and errors.

### Typography

Use an approved, licensed Bouvet font when supplied. Until then, retain the
existing `Avenir Next`, `Trebuchet MS`, sans-serif stack rather than adding an
unverified external font. Do not claim the screenshot font has been identified.

- Start with body text at `18px` on kiosk and `16px` on phone, line height at least
  `1.4`. Supporting metadata must remain readable, not screenshot-sized fine print.
- Task headings may start at `48px` on wide screens, `36px` on medium and `28px`
  on narrow screens, weight `700` or `800`. Compact tool headings use `20-24px`.
- Countdown and aggregate counters can use larger fixed sizes within stable
  containers. Check the largest expected count and localized label.
- Use breakpoint-specific `rem` values, not viewport-width font scaling. Allow
  natural wrapping; do not truncate essential instructions or shrink text to fit
  a fixed-height mockup. Keep letter spacing at zero.
- Uppercase is suitable for short context labels or action labels, not paragraphs.
  Use the same case and font treatment for equivalent controls across screens.

## Screen References

The IDs identify the supplied screen concepts, not routes or required filenames.

| Reference           | Route/state                    | Composition to preserve                                                                                                                |
| ------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| D1: Theme selection | `/`                            | Brand header, bold question, nine illustrated theme buttons in a three-column desktop grid, quiet footer and a direct path to capture. |
| D2: Countdown       | `/capture/[theme]`, countdown  | Task heading above a large live preview; centered high-contrast number on a translucent disc; visible cancel action below.             |
| D3: Picture review  | `/capture/[theme]`, review     | Large approved-framing preview, paired retake and use-picture actions beneath, brief next-step context.                                |
| D4: Generating      | `/capture/[theme]`, generating | Stable image-sized region with a restrained loading indicator and status; compact stage summary below when backed by real state.       |
| D5: Result          | `/photo/[id]`                  | Generated portrait dominates the wide layout, with QR/URL and actions in a narrower side tool; quiet footer.                           |
| D6: Overview        | `/overview`                    | Six pictures in a three-by-two wide grid, event counter to the right and restrained older/newer/home navigation below.                 |

### Theme Selection

Use uniform media proportions and card tracks so images, titles and descriptions
align. The desktop three-by-three layout becomes two columns and then one when
needed; all nine themes remain available without miniature labels. Keep artwork
recognizable, not dimmed behind text. Place short descriptions below the image.

Make each whole card a semantic button that opens capture for its theme, with a
visible focus ring. Do not add a separate selection state, continue action or
keyboard shortcut from the mockup's card numbers or "1-9" button label. Keep
the overview link subtle but discoverable. Use the agreed theme registry, not
image-derived names/slugs.

### Capture And Review

The ready state, missing from the supplied set, should reuse the same heading,
preview and action geometry. Put concise privacy/permission information before
activation, group-positioning guidance nearby and actionable camera errors in
the same region. A real video stream replaces the mockup photograph.

Use a stable landscape preview region where practical, but do not copy the very
wide screenshot crop if it cuts off participants. Match preview framing to the
captured frame under the camera playbook. Reserve space for status/actions so
the layout does not jump between ready, countdown and review.

Display the agreed `3`, `2`, `1` prominently without hiding the cancel action.
Prevent conflicting controls while counting down; announce each number once.
Keep the cancel target touch-sized even though it is small in the reference.

Review presents secondary retake and primary use-picture actions side by side
on wide screens and stacked on narrow screens. A source preview must belong to
the current private session; never use a previous group's photo as a placeholder.

### Generating

Keep the existing media region dimensions. An optional muted current-session
source can remain behind a high-contrast status layer; a neutral region is also
valid. Never dim the status text along with the image or reuse private source
bytes on the public result/gallery page.

Prefer a restrained loader; reduced-motion mode uses static state text. A step
display may represent approved source, processing and ready only when the
application knows those states. Do not animate fabricated percentage progress,
show ready before durable output, or promise a one-minute completion time.
Slow, failed, disconnected and retry states must have equally considered layouts.
Do not tell visitors that refreshing irretrievably loses a durable job; recovery
copy must match the implemented private-session resume behavior.

### Result And Sharing

Use an approximately two-thirds image/one-third sharing layout on wide screens,
subject to image proportions and a usable QR minimum. On phones, put the complete
image first and stack download, URL/copy, QR and other actions below it. QR is
primarily useful on the kiosk; download/copy should remain easy on phones.

Show the full result without cropping out people; use `contain` for the result
and print view rather than filling a fixed mockup frame. Preserve image aspect
ratio. Printing displays the image, not navigation, background art or controls.
Printer cancellation/unavailability must leave download and sharing usable.

Generate a real QR with a maintained library, dark modules on white, intact quiet
zone and no decoration/logo overlay. Verify scanning on target hardware with a
real long public ID. Wrap the readable URL without changing the copy/download
target. Use the actual canonical `/photo/[id]` URL, not the example `/p/...` link.

Kiosk presentation offers print and automatic reset; public phone pages do not
auto-reset. Keep copy and download even though they are absent from the reference.
An expired result replaces the image/QR/actions with a friendly unavailable state
and a path to a new picture. Do not display a QR for an unavailable result.

### Overview

Keep six pictures per page, with a three-by-two or two-by-three grid as space
allows. Use a single column only when needed for small screens or enlarged text;
do not change the page size. Use consistent thumbnail ratios and meaningful alt
text without invented names/identity. Thumbnail cropping must not remove group
members; use `contain` when necessary. Open the full result on selection.

Align the event counter to the right on wide screens; make it a compact summary
above or below the grid on narrow screens. Do not let a huge number dominate a
phone screen. The reference's "today" label and value `127` are placeholders:
show the real cumulative event count, including expired completed pictures.

Relative completion times are optional; derive them from actual timestamps and
provide accessible absolute times. Do not move keyboard focus or the current
older page when first-page data refreshes. Keep older/newer navigation quiet,
hide unavailable directions and never add numbered pagination.

## Responsive And Accessible Behavior

- Treat the supplied landscape screens as composition references, not fixed
  `1228 x 768` canvases. Use flexible grids, constrained content width and stable
  media tracks. Allow vertical scrolling rather than clipping content.
- No horizontal overflow, overlapping text, obscured focus or off-screen actions
  at `320px` width, landscape phones or browser zoom. Keep QR and controls within
  their containers. Sticky actions must not cover content or mobile safe areas.
- Use one main heading, semantic buttons/links and labelled inputs. Make icon-only
  controls understandable through accessible names and hover/focus tooltips;
  use existing `@lucide/vue` icons instead of custom tool SVGs.
- Meet WCAG AA contrast: `4.5:1` for normal text, `3:1` for large text and relevant
  UI boundaries. Never communicate selection, error or progress by red alone.
- Preserve visible keyboard focus; move it deliberately on capture/review/error
  transitions. Announce meaningful status changes, not each polling tick.
- Show clear disabled/busy states without resizing controls or accepting duplicate
  actions. Loading, empty, expired and recoverable error states are required even
  though the mockups mostly show happy paths.
- Keep motion purposeful and limited. Respect `prefers-reduced-motion`; no flashing
  shutter effect, sound-only countdown or moving decoration around QR codes.

## Copy And Assets

User-facing copy is Norwegian Bokmal with correct Norwegian characters. Keep it
short, welcoming and task-specific. Playfulness belongs in theme descriptions
and brief statuses, not ambiguous recovery actions or legal promises. Engineering
documentation remains English.

Follow the [language-file rules](../.github/instructions/frontend.instructions.md#language-files)
for the central Norwegian catalog, feature/state namespaces, stable message keys,
interpolation, pluralization and validation. Keep authored UI and accessibility
text out of component literals. Norwegian is the only enabled locale for now;
there is no language picker or language-prefixed route.

The theme names, event identity, button wording and photographs in the references
are illustrative until approved/configured. Do not turn the team-selection
question into personality scoring or change the nine agreed universe concepts.
Do not promise deletion "after the event" until the actual retention policy
supports that wording. Display policy-derived expiration information instead.

Use approved logo files and rights-cleared theme images; do not redraw the Bouvet
wordmark in CSS or crop it from the screenshot. Do not extract the pictured
people into production assets or use real visitor photos in committed tests.
Keep UI controls/text as real HTML, not a screenshot background. Use synthetic
or approved fixtures for visual tests and keep reports/source photos out of Git.

## Implementation And Review Checklist

For the selected UI milestone only:

1. Read the product decisions, applicable technical guide and matching D1-D6
   description. Identify missing states and required mobile behavior.
2. Follow [component reuse](#component-reuse) and the
   [central token location](#starting-tokens). Check for duplicated markup,
   behavior, colors and shared size literals before adding components or tokens.
   Verify changes to shared components/tokens across affected screens.
3. Implement pending, empty, error, expired, focus, selected and disabled states
   alongside the happy path. Use real application state for progress and totals.
4. Run focused behavior tests, then `pnpm check` and `pnpm test:e2e` for UI changes.
   Use the existing fresh production test server and desktop/mobile projects.
5. Inspect desktop and mobile Playwright screenshots for hierarchy, image framing,
   spacing, all nine theme choices, six gallery items, QR/URL fit and overflow.
   Exercise long Norwegian labels, long URLs, large counts, zoom and reduced
   motion. Compare to actual supplied screenshots only when accessible; document
   intentional differences rather than claiming unobserved visual parity.
6. Check keyboard/touch operation, focus/live regions and rendered contrast.
   Scan the real QR and test the kiosk print layout on target devices before
   event readiness. Browser screenshots do not prove camera, printer or scan success.

When adding more visual references, keep this guide canonical, annotate which
state each shows and record any deliberate change to existing guidance. Do not
copy the guide into root instructions or silently complete other milestones.
