import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise the real UI callbacks without mounting the server-backed catalogue.
const catalogue = ts.createSourceFile("catalogue.tsx", fs.readFileSync("modules/mentor/KaptenQuestionBankCataloguePageModules.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const builder = ts.createSourceFile("builder.tsx", fs.readFileSync("modules/mentor/KaptenQuestionBankBuilderPageModule.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function findNode(source: ts.SourceFile, predicate: (node: ts.Node) => boolean): ts.Node {
  let result: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (result) return;
    if (predicate(node)) result = node;
    else ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(result, "the public UI callback must exist");
  return result;
}

const createButton = findNode(catalogue, (node) =>
  ts.isJsxOpeningElement(node) && node.tagName.getText(catalogue) === "Button"
  && node.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute)
    && attribute.name.getText(catalogue) === "aria-label"
    && attribute.initializer?.getText(catalogue) === '"Buat Soal"'),
) as ts.JsxOpeningElement;
const clickAttribute = createButton.attributes.properties.find((attribute) =>
  ts.isJsxAttribute(attribute) && attribute.name.getText(catalogue) === "onClick",
) as ts.JsxAttribute;
assert.ok(clickAttribute.initializer && ts.isJsxExpression(clickAttribute.initializer));
assert.ok(clickAttribute.initializer.expression);
const closeCallback = findNode(catalogue, (node) => ts.isFunctionDeclaration(node) && node.name?.text === "handleCreateDialogOpenChange");
const createHref = findNode(catalogue, (node) => ts.isFunctionDeclaration(node) && node.name?.text === "questionBankCreateHref");
const catalogueHref = findNode(catalogue, (node) => ts.isFunctionDeclaration(node) && node.name?.text === "questionBankHref");

let open = false;
let url = new URL("https://vecalss.test/mentor/quiz/question-bank?purpose=tryout&folder=folder-1&subtest=PU&q=aljabar&page=2");
const navigations: string[] = [];
const history: string[] = [];
let onPopState: (() => void) | undefined;
const context = vm.createContext({
  URLSearchParams,
  ROOT_FOLDER: "root",
  BANKS_PER_PAGE: 6,
  state: { initialPageSize: 20 },
  initialPurpose: "tryout",
  selectedFolder: "folder-1",
  selectedCategories: [],
  selectedSubjects: ["PU"],
  initialSearch: "aljabar",
  initialSort: "updated",
  statusFilter: "",
  visiblePage: 2,
  setCreateDialogOpen: (next: boolean) => { open = next; },
  router: {
    push: (href: string) => navigations.push(href),
    replace: (href: string) => navigations.push(href),
    refresh: () => navigations.push("refresh"),
  },
  window: {
    addEventListener: (event: string, listener: () => void) => { if (event === "popstate") onPopState = listener; },
    removeEventListener: (event: string, listener: () => void) => { if (event === "popstate" && onPopState === listener) onPopState = undefined; },
    location: { get search() { return url.search; } },
    history: {
      pushState: (_state: unknown, _title: string, href: string) => { history.push(href); url = new URL(href, url); },
      replaceState: (_state: unknown, _title: string, href: string) => { url = new URL(href, url); },
    },
  },
});
const callbackCode = `${catalogueHref.getText(catalogue)}\n${createHref.getText(catalogue)}\n${closeCallback.getText(catalogue)}\nconst clickCreate = ${clickAttribute.initializer.expression.getText(catalogue)};`;
vm.runInContext(ts.transpileModule(callbackCode, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
vm.runInContext("clickCreate()", context);
assert.equal(open, true, "clicking create opens the dialog");
assert.deepEqual(navigations, [], "opening create must not navigate or reload the server-backed catalogue");
assert.equal(url.searchParams.get("create"), "1");
assert.equal(url.searchParams.get("folder"), "folder-1");
assert.equal(url.searchParams.get("purpose"), "tryout");
assert.equal(url.searchParams.get("subtest"), "PU");
assert.equal(url.searchParams.get("q"), "aljabar");
assert.equal(url.searchParams.get("page"), "2");
assert.equal(url.searchParams.get("pageSize"), "20", "opening create preserves the server-backed page size");
vm.runInContext("handleCreateDialogOpenChange(false)", context);
assert.equal(open, false);
assert.equal(url.searchParams.has("create"), false);
assert.equal(url.searchParams.get("pageSize"), "20", "closing create preserves the server-backed page size");
assert.deepEqual(navigations, [], "closing create must not refresh the catalogue either");
assert.equal(history.length, 1, "closing the dialog must not add another history entry");

const historyEffect = findNode(catalogue, (node) => ts.isCallExpression(node)
  && node.expression.getText(catalogue) === "useEffect"
  && node.getText(catalogue).includes('"popstate"'),
) as ts.CallExpression;
const subscribe = vm.runInContext(ts.transpileModule(`(${historyEffect.arguments[0].getText(catalogue)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context) as () => () => void;
const unsubscribe = subscribe();
assert.ok(onPopState);
url.searchParams.set("create", "1");
onPopState();
assert.equal(open, true, "Forward to the create URL reopens the dialog");
url.searchParams.delete("create");
onPopState();
assert.equal(open, false, "Back to the catalogue URL closes the dialog");
unsubscribe();
assert.equal(onPopState, undefined, "unmount removes the history listener");

const notice = findNode(builder, (node) => ts.isCallExpression(node) && node.expression.getText(builder) === "usePageStatusToast") as ts.CallExpression;
const noticeInput = notice.arguments[0] as ts.ObjectLiteralExpression;
const active = noticeInput.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(builder) === "active") as ts.PropertyAssignment;
function statusActive(presentation: string, mode: string, editorState: object) {
  return vm.runInNewContext(active.initializer.getText(builder), { presentation, mode, open: true, editorState, Boolean });
}
for (const editorState of [
  { hasUnsavedChanges: true, isSaving: false, saveError: null },
  { hasUnsavedChanges: true, isSaving: true, saveError: null },
]) {
  assert.equal(statusActive("modal", "create", editorState), false, "filling or saving the create dialog must not show a floating page-status notice");
  assert.equal(statusActive("page", "edit", editorState), true, "existing full-page editor status must remain available");
}

console.log("Bank Soal create dialog opens/closes without navigation and stays quiet while filling.");
