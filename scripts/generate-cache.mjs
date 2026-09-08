#!/usr/bin/env node
/**
 * Fetches the file tree for a ref of inaturalist/iNaturalistReactNative
 * straight from the GitHub API (no clone needed) and writes a Type Canopy
 * cache file describing the JS-vs-TS split under src/.
 *
 * Env vars:
 *   TARGET_REPO   default: inaturalist/iNaturalistReactNative
 *   TARGET_REF    default: main  (branch, tag, or commit SHA)
 *   OUT_FILE      default: data/cache.json
 *   GITHUB_TOKEN  optional, raises the API rate limit when set (CI sets this)
 */

import fs from "node:fs";
import path from "node:path";

const REPO = process.env.TARGET_REPO || "inaturalist/iNaturalistReactNative";
const REF = process.env.TARGET_REF || "main";
const OUT = process.env.OUT_FILE || "data/cache.json";
const SRC_PREFIX = "src/";

const EXT_RE = /\.(js|jsx|ts|tsx)$/;
const SKIP_DIR_RE = /(^|\/)(__tests__|__mocks__|l10n|node_modules)(\/|$)/;
const SKIP_FILE_RE = /\.(test|spec)\.|\.d\.ts$/;

async function ghFetch(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "type-canopy-cache",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status} for ${url}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

function buildTree(rootName, files) {
  function makeNode(name) {
    return { name, children: {}, files: [] };
  }
  const root = makeNode(rootName);

  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      if (!node.children[dirName]) node.children[dirName] = makeNode(dirName);
      node = node.children[dirName];
    }
    node.files.push({ name: parts[parts.length - 1], ext: f.ext, isTs: f.isTs, size: f.size });
  }

  function finalize(node) {
    const childArr = Object.values(node.children).map(finalize);
    const fileNodes = node.files.map(f => ({
      name: f.name,
      type: "file",
      isTs: f.isTs,
      ext: f.ext,
      size: f.size,
    }));
    let jsCount = node.files.filter(f => !f.isTs).length;
    let tsCount = node.files.filter(f => f.isTs).length;
    let totalSize = node.files.reduce((a, f) => a + f.size, 0);
    for (const c of childArr) {
      jsCount += c.jsCount;
      tsCount += c.tsCount;
      totalSize += c.totalSize;
    }
    return {
      name: node.name,
      type: "dir",
      children: [...childArr, ...fileNodes],
      jsCount,
      tsCount,
      totalSize,
    };
  }

  return finalize(root);
}

async function main() {
  const commit = await ghFetch(
    `https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(REF)}`
  );
  const sha = commit.sha;

  const treeData = await ghFetch(
    `https://api.github.com/repos/${REPO}/git/trees/${sha}?recursive=1`
  );
  if (treeData.truncated) {
    console.warn("Warning: GitHub truncated the tree response — some files may be missing.");
  }

  const files = treeData.tree
    .filter(item => item.type === "blob" && item.path.startsWith(SRC_PREFIX))
    .filter(item => !SKIP_DIR_RE.test(item.path))
    .filter(item => !SKIP_FILE_RE.test(item.path))
    .map(item => {
      const match = item.path.match(EXT_RE);
      if (!match) return null;
      const ext = "." + match[1];
      return {
        path: item.path.slice(SRC_PREFIX.length),
        ext,
        isTs: ext === ".ts" || ext === ".tsx",
        size: item.size || 0,
      };
    })
    .filter(Boolean);

  if (!files.length) {
    throw new Error(`No matching source files found under ${SRC_PREFIX} at ${REPO}#${sha}`);
  }

  const tree = buildTree("src", files);
  const payload = {
    repo: REPO,
    ref: REF,
    sha,
    generatedAt: new Date().toISOString(),
    tree,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload));

  const total = tree.jsCount + tree.tsCount;
  const pct = ((tree.tsCount / total) * 100).toFixed(1);
  console.log(`${total} files (${tree.tsCount} TS, ${tree.jsCount} JS — ${pct}% typed) @ ${REPO}#${sha.slice(0, 7)}`);
  console.log(`Wrote ${OUT}`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
