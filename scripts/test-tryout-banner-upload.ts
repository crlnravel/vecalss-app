import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const workspace = await readFile(
  `${root}/modules/mentor/KaptenTryoutBuilderPageModule.tsx`,
  "utf8",
);

assert.doesNotMatch(
  workspace,
  /TryoutBannerUploadDialog/u,
  "banner selection must not open a nested upload dialog",
);
assert.doesNotMatch(
  workspace,
  /pickerOpen|setPickerOpen/u,
  "banner selection must not be mediated by dialog state",
);
assert.match(
  workspace,
  /const bannerInputRef = useRef<HTMLInputElement \| null>\(null\)/u,
  "banner selection must own a native file input",
);
assert.match(
  workspace,
  /bannerInputRef\.current\?\.click\(\)/u,
  "banner triggers must open the native file picker directly",
);
assert.match(
  workspace,
  /accept="\.jpg[\s\S]*type="file"/u,
  "the banner surface must keep an image file input",
);
assert.match(
  workspace,
  /<TryoutBannerUploadStatus[\s\S]*progress=\{uploadProgress\}/u,
  "banner uploads must show progress inline on the existing surface",
);
assert.match(
  workspace,
  /onUploadStateChange\(true\)[\s\S]*onUploadStateChange\(false\)/u,
  "the existing create flow must stay guarded while a banner uploads",
);
assert.match(
  workspace,
  /postMediaAction<MediaUploadTicket>\("kapten",/u,
  "banner selection must retain the existing media upload flow",
);

console.log("Tryout banner upload contract passed.");
