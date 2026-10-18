import esbuild from "esbuild";
import process from "node:process";
import { readFile, writeFile } from "node:fs/promises";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  banner: { js: `/*! Pele 1.6.0\n${await readFile("licenses/pele-LICENSE", "utf8")}\n*/` },
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view"],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  minify: production,
  // Chinese UI text and the bundled prompt library stay readable UTF-8 instead of \uXXXX escapes (half the bytes).
  charset: "utf8",
  define: { "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development") },
  outfile: "main.js",
  plugins: [{ name: "host-css", setup(build) {
    build.onStart(async () => {
      const css = await Promise.all(["src/base.css", "src/chat-ui.css", "src/ui/models.css", "src/ui/review.css", "src/palettes.css", "src/settings-polish.css"].map((path) => readFile(path, "utf8")));
      await writeFile("styles.css", css.join("\n"));
    });
  } }],
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
