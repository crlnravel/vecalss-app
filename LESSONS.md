# Design Lessons

## 2026-06-19

- Fix tap targets in shared primitives first. Adjusting `button` and field-control sizing at the component layer resolves more accessibility debt than patching each page one by one.
- Placeholder proof weakens trust fastest on marketing surfaces. Real campus marks and a neutral people placeholder improve credibility without changing product behavior.
- Mobile overflow in admin tooling usually comes from flex and grid children missing `min-w-0` or forms not clipping their own width. Correct containment before redesigning layout.
- When public, auth, and portal surfaces belong to one brand, shell treatment matters as much as page content. Reusing the same editorial framing keeps the product from feeling split into unrelated apps.
- Editorial consistency needs surface consistency too. If About and FAQ use a colder background, flatter corners, or a different card language than home, the brand immediately feels fragmented.
- Test placeholder illustrations inside the actual composed panel, not only as standalone files. Some SVGs are technically valid but still feel visually absent until the surrounding contrast and framing are adjusted.
- Polish work should close the edge states, not only the happy path. A branded 404, better notices, and a real empty roster state make the product feel trustworthy when something is missing or goes wrong.
- Motion is most effective when it clarifies state change. Accordion expansion, icon rotation, and loader movement should all reinforce what just happened rather than calling attention to themselves.
