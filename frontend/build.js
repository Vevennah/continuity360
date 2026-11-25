// build.js - bundles the React app into frontend/dist using esbuild.
//   npm run build   -> one production build
//   npm run watch   -> rebuild automatically whenever a file in src/ changes
// The Python backend serves the files in dist/, so no separate dev server is needed.

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const watch = process.argv.includes("--watch");
const distDir = path.join(__dirname, "dist");

fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(path.join(__dirname, "public", "index.html"), path.join(distDir, "index.html"));

const options = {
  entryPoints: [path.join(__dirname, "src", "main.jsx")],
  bundle: true,
  outfile: path.join(distDir, "app.js"), // app.css is created next to it
  jsx: "automatic",
  loader: { ".js": "jsx" },
  minify: !watch,
  sourcemap: watch,
  target: ["es2020"],
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
  logLevel: "info",
};

async function run() {
  if (watch) {
    const context = await esbuild.context(options);
    await context.watch();
    console.log("Watching src/ for changes... (Ctrl+C to stop)");
  } else {
    await esbuild.build(options);
    console.log("Build complete -> frontend/dist");
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
