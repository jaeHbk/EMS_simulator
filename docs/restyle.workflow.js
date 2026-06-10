export const meta = {
  name: 'ed-triage-restyle',
  description: 'Restyle the ED Triage Trainer UI with shadcn/ui (two-pane clinical workspace, slate+blue, light/dark) across 7 parallel agents, then review for test-invariant + visual consistency',
  phases: [
    { title: 'Restyle', detail: 'shell + 6 vertical slices restyled with shadcn in parallel, each preserving its test invariants' },
    { title: 'Review', detail: 'adversarial review: test-invariant preservation, functionality preservation, visual consistency' },
  ],
}

const REPO = '/Users/jaehunb/Documents/EMS_simulator'
const FE = `${REPO}/frontend/src`

// ─────────────────────────────────────────────────────────────────────────────
const COMMON = `
You are restyling ONE slice of the ED Triage Trainer frontend with shadcn/ui. The app
is a web-based ED triage training simulator: a trainee works a 6-stage workflow
(CASE_LOAD → HISTORY → VITALS → ESI_ASSIGNMENT → INTERVENTIONS → FEEDBACK). Repo root:
${REPO}. cd there.

GOAL: make it look polished and presentable (conference-grade) WITHOUT changing any
behavior. This is a pure presentation change: same store calls, same onClick handlers,
same data flow, same props — only JSX structure and Tailwind classes change.

The Tailwind + shadcn foundation already exists. Read these FIRST:
- ${FE}/index.css  (theme tokens: slate neutrals, blue primary, semantic success/warning/destructive — works in light AND dark automatically)
- ${FE}/components/ui/  (the shadcn primitives you MUST build with — read the ones you use)
- ${FE}/api/contract.ts  (the data types; READ-ONLY)
- ${FE}/lib/utils.ts  (the cn() helper)

AVAILABLE shadcn primitives (import from @/components/ui/<name>; @/* = src/*):
- button: <Button variant size> variants: default | destructive | outline | secondary | ghost | link | success; sizes: default | sm | lg | icon
- card: Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
- badge: <Badge variant> default | secondary | destructive | success | warning | outline
- alert: Alert (variant default|destructive|warning|success), AlertTitle, AlertDescription
- progress: <Progress value={0..100} indicatorClassName?>
- separator: <Separator />
- textarea: <Textarea />
- label: <Label htmlFor>
- checkbox: <Checkbox checked onCheckedChange disabled>  (Radix: use onCheckedChange, NOT onChange)
- radio-group: <RadioGroup value onValueChange>, <RadioGroupItem value>
- toggle: <Toggle pressed onPressedChange variant="outline">
- tooltip: TooltipProvider, Tooltip, TooltipTrigger, TooltipContent
- scroll-area: <ScrollArea>
- lucide-react icons (import { IconName } from "lucide-react")
- cn(...) from @/lib/utils

DESIGN LANGUAGE (keep all 7 slices consistent):
- Use ONLY theme tokens via Tailwind classes (bg-card, text-foreground, text-muted-foreground,
  border-border, bg-primary, text-destructive, bg-success/10, etc.). NEVER raw hex / arbitrary colors.
  Dark mode is automatic through the tokens — don't hardcode dark: unless adjusting an alpha.
- Clinical semantics: destructive(red)=under-triage/danger; warning(amber)=caution/abnormal/over-triage;
  success(green)=correct/normal; primary(blue)=main actions & accents. Color must always pair with
  text or an icon — never carry meaning by color alone (a11y).
- Generous whitespace; rounded-xl cards with subtle shadow (the Card primitive already does this);
  CardContent uses space-y-4 / gap-4; primary advance buttons = <Button> default; secondary = outline.
- Lucide icons used sparingly to label sections (e.g. Stethoscope, Activity, ClipboardList).

HARD RULES — violating any is a defect:
1. STAY IN YOUR FILES (listed in YOUR TASK). Do NOT edit other slices' files, the ui/ primitives,
   contract.ts, the store, index.css, configs, or any *.test.* / testFixtures / storeContract files.
2. Do NOT run git, npm, vite, tsc, or any build/test command. The shared tree has other agents
   editing concurrently; running tools would see half-written files. Write carefully; verification
   happens centrally after all slices finish.
3. PRESERVE FUNCTIONALITY EXACTLY: every store hook/selector, every action call (advance, sendHistory,
   measureVitals, assignEsi, orderInterventions, requestFeedback, createEncounter, clearError), every
   onClick/onSubmit, every disabled condition, every piece of state and data flow stays identical.
   Keep all exported names and component prop signatures byte-for-byte (other files import them).
4. PRESERVE TEST INVARIANTS for your files — listed explicitly in YOUR TASK. The 48-test suite must
   stay green. These are exact DOM contracts (classes, roles, aria-*, data-*, exact text).
5. CRITICAL GOTCHA: shadcn <CardTitle> renders a <div>, NOT a heading. Any title the tests assert via
   getByRole("heading", ...) MUST be a real <h1>/<h2>/<h3> element. Render it as a real heading
   (you may style it with the same classes CardTitle uses: "font-semibold leading-none tracking-tight"),
   optionally inside CardHeader. Do not rely on CardTitle for a test-asserted heading.
6. Keep accessibility: every interactive control keeps an accessible name; keep existing aria-labels.

Return the structured manifest when done.
`

const MANIFEST = {
  type: 'object',
  additionalProperties: false,
  required: ['slice', 'filesEdited', 'primitivesUsed', 'invariantsPreserved', 'behaviorUnchanged', 'notes'],
  properties: {
    slice: { type: 'string' },
    filesEdited: { type: 'array', items: { type: 'string' } },
    primitivesUsed: { type: 'array', items: { type: 'string' } },
    invariantsPreserved: {
      type: 'array',
      items: { type: 'string' },
      description: 'each test invariant from YOUR TASK and how it is preserved (class/role/aria/text kept)',
    },
    behaviorUnchanged: { type: 'string', description: 'confirm every store call / handler / data flow is identical' },
    notes: { type: 'string' },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
phase('Restyle')

const shell = `${COMMON}
YOUR SLICE: APP SHELL + ROUTER + STEP INDICATOR + new PATIENT RAIL.
YOUR FILES (edit/create ONLY these):
- ${FE}/App.tsx
- ${FE}/workflow/WorkflowRouter.tsx
- ${FE}/workflow/StepIndicator.tsx
- ${FE}/components/PatientRail.tsx   (NEW — you create it)

BUILD a two-pane "clinical workspace" layout:
- Top header bar (sticky): app name "ED Triage Trainer" with a small clinical icon, a primary
  "Start encounter" / "Start new encounter" button (keep the existing label logic: "Start encounter"
  when no encounter, "Start new encounter" when one exists; "Starting…" while loading), and the theme
  toggle. IMPORT the theme toggle from "@/components/theme-toggle" (<ThemeToggle/>) and place it in the header.
- Below header: the mandatory disclaimer must stay VISIBLE. Keep the exported DISCLAIMER and APP_NAME
  constants and their exact strings. Render the disclaimer (e.g. a subtle muted/warning bar).
- A dismissible error banner when there's a store error (keep role="alert" + the dismiss button with
  aria-label="Dismiss error"; keep clearError()).
- MAIN two-pane grid (responsive: stacks on small screens, two columns lg+):
   LEFT RAIL = <PatientRail/> (you build): a Card with the patient's chief complaint (encounter.chiefComplaint)
     and a compact LIVE VITALS readout from encounter.measuredVitals (show measured fields with values+units,
     unmeasured as "—"; the contract has NO patient demographics, so DON'T invent age/sex — chief complaint is
     the patient identity). When no encounter, show a friendly placeholder.
   RIGHT = the workflow area: render <WorkflowRouter/> when an encounter exists, else an empty-state card
     ("No active encounter. Start one to begin triage training.").

WorkflowRouter.tsx (restyle, keep behavior + these invariants):
- Reads encounter/error/loading/createEncounter from the store EXACTLY as now.
- NO-ENCOUNTER state MUST still render: text matching /no active encounter/i AND a <button> whose
  accessible name matches /start new encounter/i (use <Button>). Keep error <p role="alert"> with the text.
- WITH encounter: render <StepIndicator current={encounter.stage}/> ABOVE the stage, an error region
  (role="alert") if error, and <StageComponent/>. Keep the STAGE_COMPONENTS map and data-stage if present.
- The stepper sits at the top of the right pane (horizontal). Make it look like a polished wizard stepper.

StepIndicator.tsx (restyle, HARD invariants — the WorkflowRouter test asserts these):
- Must render exactly 6 step elements each carrying the className "step-indicator__step"
  (you MAY add Tailwind classes alongside it, but that literal class must remain on each step).
- The current step element must have aria-current="step" AND data-stage="<STAGE>" (the enum value).
- Keep STAGE_LABELS. Style: numbered circles, done=primary/check, current=ring/accent, todo=muted,
  with connecting lines; show the label under/next to each. Use lucide Check for done steps if you like.

INVARIANTS TO PRESERVE (the tests):
- WorkflowRouter empty: getByText(/no active encounter/i) + getByRole("button",{name:/start new encounter/i}).
- WorkflowRouter error: getByRole("alert") has the error text.
- StepIndicator: container.querySelectorAll(".step-indicator__step") length === 6; the
  [aria-current="step"] element's data-stage === current stage.
Keep PatientRail purely presentational reading the store via the same useEncounterStore selectors
(it's fine for the rail to read the store; it's part of the shell).`

const caseLoad = `${COMMON}
YOUR SLICE: CASE_LOAD stage. YOUR FILE (only): ${FE}/workflow/CaseLoad.tsx
Restyle into a polished Card. Keep behavior: reads encounter + advance + loading from store; the
button calls advance("HISTORY"); disabled while loading; empty-state when no encounter.
REQUIRED test invariant: a real heading element (h2) whose text matches /chief complaint/i
(NOT a CardTitle div). Present the chief complaint prominently (e.g. a highlighted callout), keep the
guidance hint, and a primary <Button> "Begin history" (lucide icon ok, e.g. Stethoscope/ArrowRight).
Make it feel like the opening of a clinical case.`

const history = `${COMMON}
YOUR SLICE: HISTORY stage + its chat component.
YOUR FILES (only): ${FE}/workflow/History.tsx , ${FE}/components/ChatPanel.tsx
Keep behavior EXACTLY: History reads encounter/sendHistory/advance/loading; ChatPanel is presentational
with props {transcript, onSend, disabled?, placeholder?} — KEEP that prop signature (History passes them).
Enter sends, Shift+Enter newline (keep). advance("VITALS") on proceed.
REQUIRED test invariant: History renders a real heading (h2) matching /history taking/i.
Restyle ChatPanel as a proper chat: patient turns vs trainee turns as distinct aligned bubbles
(trainee = primary-tinted right-aligned, patient = muted/card left-aligned), role labels ("You" / "Patient"),
an empty hint when no turns, a <Textarea> composer + a Send <Button> (lucide Send icon). Use ScrollArea for
the transcript if helpful. Keep data-role on each turn for a11y/testability. Polished, like a messaging UI.
The "Proceed to vitals" advance button stays.`

const vitals = `${COMMON}
YOUR SLICE: VITALS stage + its grid.
YOUR FILES (only): ${FE}/workflow/Vitals.tsx , ${FE}/components/VitalsGrid.tsx
Keep behavior EXACTLY: Vitals owns pending selection (Set<VitalKey>), measureVitals([...pending]),
advance("ESI_ASSIGNMENT"), the "Measure selected" + "Proceed to ESI" buttons + their disabled logic.
KEEP exports VitalsGrid, VitalKey, VITAL_FIELDS and the props {selected, measured, onToggle, disabled?}.
REQUIRED test invariant: Vitals renders a real heading (h2) whose text is exactly "Vitals" (matches /^vitals$/i).
Restyle VitalsGrid as a clean grid of vital cards/rows: each shows the vital name + unit; unmeasured ones are
selectable (use <Checkbox> with onCheckedChange -> onToggle, NOT onChange; already-measured ones shown locked
with their value emphasized). Consider a subtle abnormal flag using warning/destructive tokens IF you can infer
range — but keep it simple and deterministic; do NOT change which fields exist or the contract. Keep data-key
on items. Make measured values prominent (big number + unit). Two action buttons in a footer.`

const esi = `${COMMON}
YOUR SLICE: ESI_ASSIGNMENT stage + its selector.
YOUR FILES (only): ${FE}/workflow/EsiAssignment.tsx , ${FE}/components/EsiSelector.tsx
Keep behavior EXACTLY: EsiAssignment has local pending pick, calls assignEsi(level), advance("INTERVENTIONS"),
"Proceed to interventions" disabled until recorded. KEEP EsiSelector props {value: number|null, onSelect:(n)=>void,
disabled?} and the exported ESI_LEVELS data (levels 1-5 with name + descriptor).
REQUIRED test invariants (EsiSelector.test — DO NOT BREAK):
- Renders text "ESI 1" … "ESI 5" (exact).
- Renders descriptor text matching /immediate life-saving intervention/i (level 1) and /needs no resources/i (level 5).
  KEEP the existing descriptor strings (don't reword those two).
- Each level option has role="radio", aria-checked ("true"/"false"), and data-level="<n>".
- Clicking the element containing text "ESI 3" calls onSelect(3). The selected one (value prop) is aria-checked true.
- When disabled, clicking does NOT call onSelect.
EsiAssignment REQUIRED: a real heading (h2) matching /esi assignment/i.
Restyle as 5 acuity tiles (a clear vertical/stacked radio list or tiles), colored by acuity: ESI 1 = destructive
(most acute), 2 = destructive/warning, 3 = warning, 4 = muted, 5 = success/muted (least acute) — color paired with
the number + label, never color-only. You may use RadioGroup semantics, but you MUST keep role="radio" + aria-checked
+ data-level on the clickable option (if RadioGroupItem doesn't expose data-level, set it; or build custom buttons with
role="radio"). Selected tile clearly highlighted. Big "ESI n" + name + descriptor per tile.`

const interventions = `${COMMON}
YOUR SLICE: INTERVENTIONS stage + its picker.
YOUR FILES (only): ${FE}/workflow/Interventions.tsx , ${FE}/components/InterventionPicker.tsx
Keep behavior EXACTLY: Interventions seeds local selection from encounter.interventionsOrdered, gates feedback
on store error (the existing submitAndAdvance logic that awaits orderInterventions then checks
useEncounterStore.getState().error before requestFeedback) — KEEP THAT LOGIC EXACTLY. KEEP InterventionPicker props
{selected: ReadonlySet<string>, onToggle, disabled?} and exported INTERVENTION_OPTIONS.
REQUIRED test invariant (Interventions.test): the submit button's accessible name matches /submit and see feedback/i
(keep a <Button> with that text). Interventions section should have a sensible heading; the WorkflowRouter test
matches the stage by heading /critical interventions/i, so render a real heading (h2) matching that.
Restyle InterventionPicker as a grid of selectable chips/toggle cards (use <Toggle variant="outline"> with
pressed/onPressedChange mapped to selected/onToggle, OR <Checkbox> cards), each labeled (keep INTERVENTION_OPTIONS
labels), with a lucide icon per category if tasteful. Clear selected state. Polished multi-select.`

const feedback = `${COMMON}
YOUR SLICE: FEEDBACK stage + its score card. This is the most important screen — make it shine.
YOUR FILES (only): ${FE}/workflow/Feedback.tsx , ${FE}/components/ScoreCard.tsx
Keep behavior EXACTLY: Feedback reads encounter + createEncounter + loading; renders ScoreCard when
encounter.scoreReport exists, the narrative when present, a "scoring this encounter…" placeholder when the
report is null, and a "Start a new encounter" button. ScoreCard props {report: ScoreReport} (keep).
REQUIRED test invariants (Feedback.test + ScoreCard.test + WorkflowRouter.test — DO NOT BREAK):
- Feedback renders a real heading (h2) whose text is exactly "Feedback" (matches /^feedback$/i) EVEN when a report
  is present (the WorkflowRouter test asserts this with a report present).
- No-report branch: getByText(/scoring this encounter/i).
- Feedback shows each missedRedFlags entry as text; shows the LLM narrative text when present.
- ScoreCard UNDER_TRIAGE: an element with role="alert", data-direction="UNDER_TRIAGE", containing text
  /under-triage/i AND /safety warning/i AND /less acute/i. KEEP the existing DIRECTION_COPY strings (they contain
  "Under-triage — safety warning" and "LESS acute"). The under-triage banner is the assertive alert.
- ScoreCard CORRECT: NO role="alert"; text /correct triage/i present.
- ScoreCard OVER_TRIAGE: NO role="alert"; an element role="status" with data-direction="OVER_TRIAGE", text /over-triage/i.
- ScoreCard shows "ESI {assigned}" and "ESI {expert}" text; lists each missedRedFlags entry.
Restyle ScoreCard beautifully: a big overall-score hero (the overallPercent as a large number / radial-or-bar),
the triage-direction banner styled by tone (UNDER_TRIAGE=destructive Alert, OVER_TRIAGE=warning, CORRECT=success),
the per-dimension breakdown using <Progress> bars (keep the data, make it gorgeous), a "Missed red flags" section
(destructive/warning chips or list), and the narrative in a readable card. Keep all role/aria/data-* exactly.
Use the <Alert>/<Badge>/<Progress>/<Card> primitives. This screen is the demo's payoff — be impressive but clinical.`

const results = await parallel([
  () => agent(shell,         { label: 'restyle:shell',         phase: 'Restyle', schema: MANIFEST }),
  () => agent(caseLoad,      { label: 'restyle:case-load',     phase: 'Restyle', schema: MANIFEST }),
  () => agent(history,       { label: 'restyle:history',       phase: 'Restyle', schema: MANIFEST }),
  () => agent(vitals,        { label: 'restyle:vitals',        phase: 'Restyle', schema: MANIFEST }),
  () => agent(esi,           { label: 'restyle:esi',           phase: 'Restyle', schema: MANIFEST }),
  () => agent(interventions, { label: 'restyle:interventions', phase: 'Restyle', schema: MANIFEST }),
  () => agent(feedback,      { label: 'restyle:feedback',      phase: 'Restyle', schema: MANIFEST }),
])

const built = results.filter(Boolean)
log(`Restyle done: ${built.length}/7 slices`)

// ─────────────────────────────────────────────────────────────────────────────
phase('Review')

const REVIEW = {
  type: 'object',
  additionalProperties: false,
  required: ['area', 'verdict', 'findings'],
  properties: {
    area: { type: 'string' },
    verdict: { type: 'string', enum: ['PASS', 'DEFECTS_FOUND'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'file', 'detail', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['CRITICAL', 'MAJOR', 'MINOR'] },
          file: { type: 'string' },
          detail: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
  },
}

const reviewInvariants = `${COMMON.split('Return the structured manifest')[0]}
You are an ADVERSARIAL reviewer. Do NOT edit files. Read every restyled file under ${FE}/workflow/ and
${FE}/components/ (App.tsx, WorkflowRouter.tsx, StepIndicator.tsx, PatientRail.tsx, all 6 stages, ChatPanel,
VitalsGrid, EsiSelector, InterventionPicker, ScoreCard) AND the test files (*.test.tsx) + testFixtures.ts.
Find any place the restyle BROKE a test invariant or changed behavior. Check, citing file:line:
- StepIndicator: 6 elements with literal class "step-indicator__step"; current has aria-current="step" + data-stage.
- Stage headings are REAL heading elements (getByRole heading) with the exact matched text: chief complaint /
  history taking / "Vitals" / esi assignment / critical interventions / "Feedback". (CardTitle is a <div> — flag it
  if a required heading is a CardTitle and not a real h-tag.)
- EsiSelector: role="radio" + aria-checked + data-level on options; "ESI 1".."ESI 5" text; descriptors
  /immediate life-saving intervention/i and /needs no resources/i intact; disabled blocks onSelect; onSelect(n) on click.
- ScoreCard: UNDER_TRIAGE -> role="alert" + data-direction + /under-triage/i + /safety warning/i + /less acute/i;
  CORRECT -> no alert + /correct triage/i; OVER_TRIAGE -> role="status" + data-direction + /over-triage/i; ESI assigned/expert text; missed red flags listed.
- Feedback: heading exactly "Feedback" even with a report; /scoring this encounter/i when no report; narrative + missed red flags shown.
- Interventions: button /submit and see feedback/i; the gate-on-error feedback logic unchanged.
- Behavior: every store selector/action call and handler is identical to before (no removed/renamed actions, same disabled logic).
- Prop signatures + exported names of shared components unchanged.
Report PASS only if you find nothing. Be specific.`

const reviewVisual = `${COMMON.split('Return the structured manifest')[0]}
You are a design/consistency reviewer. Do NOT edit files. Read all restyled files under ${FE}/workflow/ and
${FE}/components/. Assess visual consistency + correctness of the shadcn usage, citing file:line:
- Tokens only: no raw hex / arbitrary color values; colors come from theme tokens so dark mode works. Flag any
  hardcoded color or any dark:-only hack that would break a token.
- Consistency across the 7 slices: card padding/spacing, heading sizes, button variants for primary vs secondary
  actions, icon usage — flag divergence (e.g. one stage uses a giant title, another tiny).
- Correct primitive APIs: Checkbox uses onCheckedChange (not onChange); RadioGroup uses value/onValueChange;
  Toggle uses pressed/onPressedChange; Progress uses value 0..100; Button variants exist. Flag misuse that would
  not compile or would silently no-op.
- Clinical semantics applied sensibly (under-triage=destructive, over=warning, correct=success, abnormal flagged).
- Accessibility: interactive controls have accessible names; color not the sole signal.
- Likely tsc-strict problems (implicit any, missing null guards, unused imports).
Report PASS only if clean.`

const reviews = await parallel([
  () => agent(reviewInvariants, { label: 'review:invariants+behavior', phase: 'Review', schema: REVIEW }),
  () => agent(reviewVisual,     { label: 'review:visual+shadcn',       phase: 'Review', schema: REVIEW }),
])

const reviewReport = reviews.filter(Boolean)

return {
  restyled: built,
  reviews: reviewReport,
  critical: reviewReport.flatMap((r) => r.findings.filter((f) => f.severity === 'CRITICAL')),
  major: reviewReport.flatMap((r) => r.findings.filter((f) => f.severity === 'MAJOR')),
  minor: reviewReport.flatMap((r) => r.findings.filter((f) => f.severity === 'MINOR')),
}
