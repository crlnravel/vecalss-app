# UX guidelines

Use this guide when deciding what a user needs to understand, choose, or do.
It applies to Voyager learning, Kapten authoring, admin operations, and public
marketing. Pair it with the focused visual or interaction guide for the work.

[Back to the design-system index](../../DESIGN.md) · [Principles](principles.md)

## Source and authority

Adapted from Jon Yablonski’s [Laws of UX](https://lawsofux.com/), reviewed
31 October 2026. The linked principle names below point to the source entries.
The interpretations, product examples, safeguards, and review criteria are
Vecalss guidance, rather than quotations or a reproduction of the website.
The reference covers all 30 entries listed on the source homepage on that date.

The [information architecture section](#information-architecture-ia) also draws
on Baymard’s [Information Architecture in UX](https://baymard.com/blog/information-architecture-ux),
reviewed 31 October 2026. Baymard discusses ecommerce; the Vecalss applications
below are local design guidance, not findings validated in this learning product.

Treat these concepts as design heuristics to test in context, not universal
predictions or proof that a design works. Existing product contracts,
accessibility requirements, and the design system take precedence. This guide
does not authorize new routes, changed assessment rules, new component families,
or exceptions to the established visual language.

| Decision | Authority |
| --- | --- |
| Palette, typography, geometry, layout, motion | [DESIGN.md](../../DESIGN.md) and [Foundations](foundations.md) |
| Buttons, fields, badges, tabs, tooltips | [Components](components.md) |
| Validation, notifications, unsaved changes, recovery | [Feedback](feedback.md), including its documented local exceptions |
| Tables, search, filters, empty states | [Operations](operations.md) |
| Parent navigation and learning progress | [Navigation](navigation.md) |
| Information architecture, attention, comprehension, choice, task continuity | This guide, within the contracts above |

## Start with the user's task

Before choosing a layout, identify the role, immediate goal, information needed
for the decision, and the next available action. Review the result against
task completion and recovery, rather than visual appeal alone.

| Surface | Primary UX job | Apply the existing design language |
| --- | --- | --- |
| Voyager learning | Understand the next learning activity, current progress, and how to resume. | Use the Materi journey where progress is the task; keep reading and answering calm. |
| Kuis and Tryout participation | Understand instructions, navigate questions, and submit with confidence. | Keep task controls stable; preserve assessment rules and distinguish an answered question from a saved answer. |
| Kapten authoring | Create, revise, review, and publish content without losing work. | Use focused sections, shared controls, existing save protection, and actionable readiness blockers. |
| Admin operations | Find the right record, understand scope, and act safely. | Use approved tables and explicit selection, filtering, and bulk-action boundaries. |
| Public marketing | Understand the offer, evaluate proof, and find an entry action. | Preserve the continuous Harbor Canvas, connected scenes, and readable content without motion. |

## Information architecture (IA)

IA concerns how content is structured and found; UX also covers how the whole
task feels and works. Baymard describes four systems: organization, labeling,
navigation, and search. It presents eight principles: objects, choices,
disclosure, exemplars, front doors, multiple classification, focused navigation,
and growth. Together they encourage meaningful content relationships,
understandable destinations, useful previews, multiple ways to find content,
and structures that remain usable as content expands.
[Source: Baymard](https://baymard.com/blog/information-architecture-ux).

### Apply the four systems in Vecalss

| System | Local application |
| --- | --- |
| Organization | Document the content objects and their existing relationships before arranging a menu. Use hierarchy for subject catalogues, sequence for an existing ordered task, and cross-links or filters for alternative discovery. A learning recommendation does not create a new prerequisite. |
| Labeling | Use the established Materi, Kuis, Tryout, and Bank Soal vocabulary consistently across entry links, destination titles, breadcrumbs, and search. Follow the copywriting policy for new labels; do not expose database or implementation names. |
| Navigation | Separate the application shell, peer-workspace tabs, parent breadcrumbs, and within-task controls by purpose. Follow [Navigation](navigation.md) for exact parent-return behavior and [Components](components.md) for shared controls. |
| Search | State the collection being searched and keep active filters understandable. Follow [Operations](operations.md) for server-owned filtering, sorting, pagination, and empty-result recovery. Search must respect the same access and release rules as browsing. |

### Apply the eight principles in Vecalss

These are proposed-design review rules, not a claim that every existing screen
already meets them or authorization to change a route or flow.

| Principle | Local design check |
| --- | --- |
| Objects | Distinguish a lesson, question bank, assessment, and participant result by its purpose, owner, relationships, and lifecycle. Saving a draft and releasing a result must remain separate concepts. |
| Choices | On a subject catalogue, prioritize finding a relevant activity. In an editor, prioritize the current editing task. Avoid giving unrelated administrative actions equal weight. |
| Disclosure | Before opening or starting an activity, expose the available information needed to decide, such as scope, duration, or availability. Never hide submission consequences or readiness blockers as secondary detail. |
| Exemplars | When a category label is unclear, use representative, accessible content titles or topics to show what belongs there. Avoid decorative examples or examples that reveal restricted questions. |
| Front doors | Review direct entry to a lesson, editor, or result page. The page should identify its destination and context and provide the existing parent or recovery path; it must not assume arrival through the homepage. Preserve login and authorization checks. |
| Multiple classification | Where the existing domain supports it, let a user find the same content through a subject, search, or relevant filter. Preserve one content identity rather than creating duplicate records for each discovery path. |
| Focused navigation | Keep role-specific workspaces coherent. Do not mix student learning actions with authoring or admin operations, or turn record actions into navigation tabs. Desktop and mobile must expose the same permitted destinations. |
| Growth | Review long names, populated catalogues, deeper existing hierarchies, and empty collections. Use the approved search, pagination, truncation, and overflow patterns before adding navigation levels or a new layout. |

### Validate findability before changing structure

For a proposed structural change, capture the affected content inventory, role,
entry point, current parent relationship, label, discovery paths, and visibility
rules. Identify the actual findability problem before rearranging navigation.

Use card sorting when category membership or terminology is uncertain; use tree
testing to check whether people can locate a destination in a proposed hierarchy.
These are local validation recommendations, not results reported for Vecalss.
Use realistic tasks, such as finding a subject lesson, reopening a draft, or
locating an available result. Observe first choice, wrong turns, completion,
and recovery; do not impose an arbitrary maximum depth or universal click limit.

Keep any revised sitemap or taxonomy as a proposal until the required product
approval. This documentation does not add a search feature, rename destinations,
or change the current hierarchy. Follow the repository's browser permission
policy whenever validation involves interactive browser use.

## Choice and understanding

The meaning column paraphrases the source concept; the application column
defines how to use it in Vecalss.

| Principle | Meaning | Vecalss application and boundary |
| --- | --- | --- |
| [Hick’s Law](https://lawsofux.com/hicks-law/) | More complex choices can take longer to resolve. | Give each task one clear primary action; group secondary actions in the shared menu. Keep consequential alternatives visible when comparison is necessary. |
| [Choice Overload](https://lawsofux.com/choice-overload/) | Excessive options can obstruct a decision. | Help users narrow Materi, Kuis, and Bank Soal through relevant search and filters. Compare program attributes consistently; never hide material differences to make selection easier. |
| [Cognitive Load](https://lawsofux.com/cognitive-load/) | Understanding an interface uses mental effort. | Remove duplicated status, decorative metrics, and repeated instructions. In an assessment, reserve attention for the question, answer, navigation, and timing information required by the task. |
| [Chunking](https://lawsofux.com/chunking/) | Meaningful groups make information easier to process. | Group authoring fields by purpose and lesson content by topic. Use headings and spacing before adding another panel or step. |
| [Miller’s Law](https://lawsofux.com/millers-law/) | Immediate memory has limited capacity. | Keep decisions and their context together. Do not impose a seven-item navigation, field, or lesson limit; the source explicitly warns against that interpretation. |
| [Working Memory](https://lawsofux.com/working-memory/) | Active tasks depend on temporarily held information. | Preserve entered values after a failed save, retain relevant filter context, and show the selected record or question identity where the user acts. Avoid making people remember data from another page. |
| [Mental Model](https://lawsofux.com/mental-model/) | People act using their understanding of how a system works. | Organize learning around familiar Materi, Kuis, and Tryout concepts. Explain publishing and availability where users make those decisions; do not imply that saving automatically publishes content. |
| [Jakob’s Law](https://lawsofux.com/jakobs-law/) | Familiar behavior helps people transfer prior experience. | Reuse shared fields, menus, tabs, and action meanings across roles. Preserve the project's breadcrumb and plain-text return conventions; familiarity does not justify reintroducing back-arrow controls. |
| [Paradox of the Active User](https://lawsofux.com/paradox-of-the-active-user/) | People often begin using software before reading instructions. | Make the first useful action discoverable. Put essential guidance at the relevant field or decision; a tutorial must not be the only place that explains a consequential action. |

## Grouping and hierarchy

| Principle | Meaning | Vecalss application and boundary |
| --- | --- | --- |
| [Law of Proximity](https://lawsofux.com/law-of-proximity/) | Nearby elements appear related. | Keep field labels, helper text, and validation triggers close to their field. Use the spacing scale to separate tasks more strongly than details within a task. |
| [Law of Common Region](https://lawsofux.com/law-of-common-region/) | A shared boundary suggests a group. | Use existing table frames, dialogs, and functional containers where a boundary clarifies scope. On the public landing, use whitespace, alignment, and dividers; this principle does not permit backing cards or section frames. |
| [Law of Similarity](https://lawsofux.com/law-of-similarity/) | Similar-looking elements appear related. | Keep the same shared treatment for the same action or status across roles. Distinguish destructive actions through the approved variant and clear text, never color alone. |
| [Law of Uniform Connectedness](https://lawsofux.com/law-of-uniform-connectedness/) | Visible connections imply relationships. | Journey routes and marketing networks must express a meaningful relationship or sequence. Provide equivalent structure in reading order and text; decorative lines must not be the only explanation. |
| [Law of Prägnanz](https://lawsofux.com/law-of-pr%C3%A4gnanz/) | People favor coherent, simple interpretations. | Keep hierarchy and state changes unambiguous. Avoid competing focal points or several visual treatments for the same selection state; reuse the approved sunken tabs. |
| [Von Restorff Effect](https://lawsofux.com/von-restorff-effect/) | A distinctive item attracts memory and attention. | Reserve strong emphasis for the primary action, current milestone, or real problem. Keep ordinary records quiet; do not add success badges merely to make them stand out. |
| [Selective Attention](https://lawsofux.com/selective-attention/) | People prioritize signals relevant to their goal. | Put readiness blockers next to the publishing decision and keep question controls easy to find. Do not compete with learning through promotional prompts or repeated notifications. |
| [Serial Position Effect](https://lawsofux.com/serial-position-effect/) | Position can affect recall of items in a sequence. | Put identifying information early and the next useful action at a natural endpoint. Keep source order meaningful on mobile and for assistive technology; avoid rearrangement solely to exploit recall. |
| [Aesthetic-Usability Effect](https://lawsofux.com/aesthetic-usability-effect/) | Visual appeal can improve perceived usability. | Use the established voyage palette, typography, and tactile controls consistently. Verify that users can complete and recover from the task: a polished surface can conceal usability defects. |

## Interaction, feedback, and recovery

| Principle | Meaning | Vecalss application and boundary |
| --- | --- | --- |
| [Fitts’s Law](https://lawsofux.com/fittss-law/) | Target size and travel distance affect acquisition. | Keep primary controls near the task, provide the existing 44px minimum touch targets, and separate neighboring actions. Keep button hit areas stable during hover and press; support keyboard operation. The pixel value is a project rule, not a value derived from the law. |
| [Doherty Threshold](https://lawsofux.com/doherty-threshold/) | Fast response supports uninterrupted interaction. | Aim to acknowledge interaction within about 400ms where feasible. Distinguish immediate pending feedback from server-confirmed completion. Use honest progress or indeterminate waiting; never add fake percentages or intentional delay. This is a responsiveness heuristic, not a guarantee that every operation finishes within 400ms. |
| [Flow](https://lawsofux.com/flow/) | Clear goals and suitable challenge support focused activity. | Keep learning and authoring controls predictable and avoid unnecessary interruptions. Preserve assessment restrictions and required confirmations; this principle does not authorize changing question difficulty or grading. |
| [Postel’s Law](https://lawsofux.com/postels-law/) | Tolerant input and consistent output can reduce friction. | Accept harmless formatting differences only when meaning remains unambiguous and the domain contract allows normalization. Validate at the server boundary; never silently reinterpret answers, scores, dates, identity, or permission-sensitive input. |
| [Tesler’s Law](https://lawsofux.com/teslers-law/) | Some task complexity must be handled somewhere. | Let the system derive values it already knows and explain remaining publication requirements. Do not offload internal identifiers or implementation terminology onto users, or conceal material consequences behind automation. |
| [Occam’s Razor](https://lawsofux.com/occams-razor/) | Prefer a sufficient explanation with fewer assumptions. | Reuse a shared control or direct task sequence before inventing a new pattern. Remove redundant steps while preserving permissions, validation, review, and recovery. |
| [Pareto Principle](https://lawsofux.com/pareto-principle/) | A subset of causes may account for much of an outcome. | Use observed task frequency and impact to prioritize improvements to learning, saving, finding, and publishing. Treat an 80/20 split as a heuristic; low-frequency accessibility and recovery paths remain essential. |
| [Parkinson’s Law](https://lawsofux.com/parkinsons-law/) | Work can expand to occupy available time. | Reduce redundant entry and unnecessary setup; define a clear completion condition. Do not introduce artificial countdowns or alter exam timing to pressure users into acting faster. |

## Progress, motivation, and trust

| Principle | Meaning | Vecalss application and boundary |
| --- | --- | --- |
| [Goal-Gradient Effect](https://lawsofux.com/goal-gradient-effect/) | Approaching a goal can increase motivation. | Show actual completed and remaining learning work with a clear next step. Never invent completed lessons, inflate readiness, or show artificial head starts. Progress must reflect the authoritative state. |
| [Zeigarnik Effect](https://lawsofux.com/zeigarnik-effect/) | Interrupted tasks can remain mentally salient. | Make unfinished learning and drafts easy to resume. Keep unsaved-change protection under the existing feedback contract and local exceptions. Avoid guilt, repeated nags, or treating every unfinished item as an error. |
| [Peak-End Rule](https://lawsofux.com/peak-end-rule/) | Memorable moments and endings can shape overall impressions. | Make submission, publication, and lesson completion clear and reliable. Confirm only real outcomes and offer an available next step; celebration must never conceal a failure or imply unreleased results are available. |
| [Cognitive Bias](https://lawsofux.com/cognitive-bias/) | Mental shortcuts can systematically skew judgment. | Present program comparisons and results with balanced evidence and clear scope. In design review, seek task failures as well as positive reactions; avoid invented scarcity, misleading defaults, or claims of guaranteed admission. |

## Fit with the existing system

- **Attention:** Use one clear primary action per task context. Keep secondary
  actions quieter through approved variants. Familiar compact utilities may
  remain icon-only with shared tooltips; consequential or ambiguous actions
  retain visible text.
- **Feedback:** Follow [Feedback](feedback.md) for placement, validation
  tooltips, persistent page status, deduplication, and local exceptions. Never
  add another banner or toast because a heuristic calls for feedback. Retain
  field error descriptions for assistive technology and keep blocking recovery
  content in the task flow.
- **Progress:** Distinguish viewing, answering, saving, submitting, publishing,
  and releasing results. Show only the state the system can establish. A local
  animation or pending indicator is never proof of persistence.
- **Accessibility:** Preserve labels, semantic controls, visible focus, logical
  reading order, contrast, and keyboard/touch access. Motion, color, position,
  and hover must not be the sole carriers of meaning. Reduced motion must
  retain the same content and actions.
- **Density:** Use progressive disclosure for secondary detail without hiding
  prerequisites, important errors, or consequences. Retain approved operational
  tables and mobile overflow rules; chunking does not require a new card grid.
- **Language:** Keep this technical guidance in the repository's documentation
  language. Write product copy in plain Indonesian under the
  [copywriting policy](../../.agents/rules/copywriting.md) and
  [tutur-humanizer skill](../../.agents/skills-library/domain/tutur-humanizer/SKILL.md).
  Do not put psychology terminology into student-facing controls or messages.

## Review checklist

Use this checklist when creating or changing a flow. Record concrete evidence
for the affected task; listing law names is not evidence of usability.

- [ ] The role, immediate goal, next action, and completion condition are clear.
- [ ] Choices are relevant, grouped, and comparable without hiding consequences.
- [ ] Content has a clear identity and parent; labels and discovery paths remain
  consistent across browsing, search, direct entry, roles, and mobile navigation.
- [ ] The proposed structure handles realistic content growth and empty results;
  uncertain categories or labels have a stated findability validation plan.
- [ ] Users can act without remembering information from another screen.
- [ ] Layout and controls follow the focused design guides and shared patterns.
- [ ] Targets are reachable; labels, focus, reading order, and state remain
  understandable with keyboard, touch, assistive technology, and reduced motion.
- [ ] Pending, confirmed, failed, and recoverable states are distinguishable;
  entered work survives recoverable errors and notifications are not duplicated.
- [ ] Progress and outcomes reflect actual saved or released state; completion
  offers only a next action the user can take.
- [ ] Narrow-screen layouts preserve task priority and primary-action access.
- [ ] Verification follows the repository's testing policy: Obscura for automated
  checks; prior explicit permission for interactive ego-browser verification.

For a substantial change, note the observed task problem, the relevant heuristic,
the chosen behavior, and what would demonstrate improvement. Useful signals
include completion rate, time to the correct action, error rate, successful
recovery, and user comprehension. Do not claim improvements without evidence.
