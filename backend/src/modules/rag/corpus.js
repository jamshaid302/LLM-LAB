import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { extractPdfText } from "./pdf-text.js";

const DOCUMENT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

function isPdf(name) {
  return name.toLowerCase().endsWith(".pdf");
}

/** A single uploaded file name. Rejects folders, traversal, and anything that is not .txt, .md, or .pdf. */
export function documentName(filename) {
  const raw = String(filename ?? "");
  if (raw !== path.basename(raw) || raw.includes("..")) return null;
  if (!DOCUMENT_NAME.test(raw)) return null;
  if (!isCorpusFile(raw)) return null;
  return raw;
}

const PROTECTED_DOCUMENTS = ["knowledge.txt", "office.txt"];

export function isProtectedDocument(name) {
  return PROTECTED_DOCUMENTS.includes(String(name ?? "").toLowerCase());
}

function isCorpusFile(name) {
  const lower = name.toLowerCase();
  return lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".pdf");
}

async function documentFromBytes(name, bytes) {
  const text = isPdf(name) ? await extractPdfText(bytes) : bytes.toString("utf8");
  return { source: name, text };
}

/**
 * Read one file, or every .txt, .md, and .pdf file in a folder. The hash covers the
 * file names and the raw bytes, so adding or editing a file changes it and a restart
 * embeds again. A PDF is hashed as bytes and chunked from its extracted text. Names
 * are sorted so the hash does not depend on directory order.
 */
export async function readCorpus(corpusPath) {
  const stat = await fs.stat(corpusPath);
  if (stat.isDirectory()) return readDirectory(corpusPath);

  const name = path.basename(corpusPath);
  const bytes = await fs.readFile(corpusPath);
  return {
    documents: [await documentFromBytes(name, bytes)],
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function readDirectory(dirPath) {
  const names = (await fs.readdir(dirPath)).filter(isCorpusFile).sort();
  if (names.length === 0) {
    throw new Error(`No .txt, .md, or .pdf files in ${dirPath}`);
  }

  const hash = createHash("sha256");
  const documents = [];
  for (const name of names) {
    const bytes = await fs.readFile(path.join(dirPath, name));
    hash.update(name);
    hash.update("\0");
    hash.update(bytes);
    hash.update("\0");
    documents.push(await documentFromBytes(name, bytes));
  }
  return { documents, hash: hash.digest("hex") };
}

/** Names in a docs folder, with the sample files marked so the page cannot remove them. */
export async function listCorpusFiles(dirPath) {
  const names = (await fs.readdir(dirPath)).filter(isCorpusFile).sort();
  return names.map((name) => ({ name, removable: !isProtectedDocument(name) }));
}
