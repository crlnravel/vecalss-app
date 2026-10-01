import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Exercise the wrappers through Base UI, so callback regressions cannot pass
// merely because their functions still appear in the source.
for (const orientation of ["horizontal", "vertical"] as const) {
  for (const value of ["first", "second"]) {
    const markup = renderToStaticMarkup(createElement(Tabs, {
      orientation,
      value,
      className: (state) => `root-${state.orientation}`,
    },
    createElement(TabsList, {
      className: (state) => `list-${state.orientation}`,
    }, ...["first", "second"].map((tabValue) => createElement(TabsTrigger, {
      key: tabValue,
      value: tabValue,
      className: (state) => `${tabValue}-${state.active ? "selected" : "idle"}`,
    }, tabValue))),
    ...["first", "second"].map((tabValue) => createElement(TabsContent, {
      key: tabValue,
      value: tabValue,
      keepMounted: true,
      className: (state) => `${tabValue}-${state.hidden ? "hidden" : "visible"}`,
    }, `${tabValue} content`))));

    const other = value === "first" ? "second" : "first";
    for (const expected of [
      `root-${orientation}`, `list-${orientation}`,
      `${value}-selected`, `${other}-idle`,
      `${value}-visible`, `${other}-hidden`,
      "group/tabs", "group/tabs-list", "flex-1 text-ui-sm",
    ]) {
      assert.ok(markup.includes(expected), `Missing composed state class: ${expected}`);
    }
  }
}

const disabledLink = renderToStaticMarkup(createElement(Button, {
  disabled: true,
  render: createElement("a", { href: "/destination" }),
}, "Back"));
assert.match(disabledLink, /^<a\b/);
assert.match(disabledLink, /aria-disabled="true"/);
assert.match(disabledLink, /tabindex="-1"/);
assert.doesNotMatch(disabledLink, /\sdisabled(?:=|\s|>)/);

const enabledLink = renderToStaticMarkup(createElement(Button, {
  render: createElement("a", { href: "/destination" }),
}, "Back"));
assert.match(enabledLink, /href="\/destination"/);
assert.doesNotMatch(enabledLink, /aria-disabled="true"/);

const initialsAvatar = renderToStaticMarkup(createElement(Avatar, {
  className: (state) => `avatar-${state.imageLoadingStatus}`,
}, createElement(AvatarFallback, {
  className: (state) => `fallback-${state.imageLoadingStatus}`,
}, "AR")));
assert.match(initialsAvatar, /avatar-idle/);
assert.match(initialsAvatar, /fallback-idle/);
assert.match(initialsAvatar, />AR<\/span>/);

console.log("PASS primitive state contracts: tabs/avatar callback composition and rendered-anchor disabled semantics");
