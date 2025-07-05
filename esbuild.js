const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`,
        );
      });
      console.log("[watch] build finished");
    });
  },
};

async function main() {
  const extensionContext = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode"],
    logLevel: "silent",
    define: {
      'process.env.NICKNAME': JSON.stringify(process.env.NICKNAME || 'Volga'),
    },
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });

  const webviewContext = await esbuild.context({
    entryPoints: ["src/webview/index.tsx"],
    bundle: true,
    format: "iife",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "browser",
    outfile: "dist/webview.js",
    logLevel: "silent",
    jsx: "automatic",
    define: {
      'process.env.NICKNAME': JSON.stringify(process.env.NICKNAME || 'Volga'),
    },
    plugins: [esbuildProblemMatcherPlugin],
  });

  if (watch) {
    await extensionContext.watch();
    await webviewContext.watch();
  } else {
    await extensionContext.rebuild();
    await webviewContext.rebuild();
    await extensionContext.dispose();
    await webviewContext.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
