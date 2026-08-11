import fs from "node:fs";
import { converter } from "culori";

const toOklch = converter("oklch");

const paletteModule = await import("./palette.mjs");
const palette = paletteModule.palette;

let css = `/* AUTO-GENERATED FILE */
/* DO NOT EDIT */

:root {
`;

for (const [group, shades] of Object.entries(palette)) {
  for (const [shade, hex] of Object.entries(shades)) {
    const color = toOklch(hex);
    const hue = Number.isFinite(color.h) ? color.h : 0;

    css += `  --${group}-${shade}: oklch(${color.l.toFixed(3)} ${color.c.toFixed(3)} ${hue.toFixed(1)});\n`;
  }
}

css += "}\n\n";

css += "@theme inline {\n";

for (const [group, shades] of Object.entries(palette)) {
  for (const shade of Object.keys(shades)) {
    css += `  --color-${group}-${shade}: var(--${group}-${shade});\n`;
  }
}

css += "}\n";

fs.writeFileSync("app/generated-theme.css", css);

console.log("✓ generated app/generated-theme.css");
