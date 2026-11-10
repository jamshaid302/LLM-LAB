import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { extractPdfText } from "./pdf-text.js";
import { SHARED_OWNER, isAccountId } from "../../core/users.js";

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

async function documentFromBytes(name, bytes, owner) {
  const text = isPdf(name) ? await extractPdfText(bytes) : bytes.toString("utf8");
  return { source: name, text, owner };
}

const CORPUS_SCHEMA = "owner-v1";

async function readFileDocument(hash, folder, name, owner) {
  const bytes = await fs.readFile(path.join(folder, name));
  hash.update(owner);
  hash.update("\0");
  hash.update(name);
  hash.update("\0");
  hash.update(bytes);
  hash.update("\0");
  return documentFromBytes(name, bytes, owner);
}

async function directoryExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch (err) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

/**
 * Read one file, or every .txt, .md, and .pdf file in a folder. Files in the
 * folder root are shared. Files under users/<id>/ belong to that person. The
 * hash covers the owner, the file name, and the raw bytes.
 */
export async function readCorpus(corpusPath) {
  const stat = await fs.stat(corpusPath);
  if (stat.isDirectory()) return readDirectory(corpusPath);

  const name = path.basename(corpusPath);
  const bytes = await fs.readFile(corpusPath);
  const hash = createHash("sha256");
  hash.update(CORPUS_SCHEMA);
  hash.update("\0");
  hash.update(bytes);
  return {
    documents: [await documentFromBytes(name, bytes, SHARED_OWNER)],
    hash: hash.digest("hex"),
  };
}

async function readDirectory(dirPath) {
  const hash = createHash("sha256");
  hash.update(CORPUS_SCHEMA);
  hash.update("\0");
  const documents = [];

  const rootNames = (await fs.readdir(dirPath, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && isCorpusFile(entry.name))
    .map((entry) => entry.name)
    .sort();
  for (const name of rootNames) {
    documents.push(await readFileDocument(hash, dirPath, name, SHARED_OWNER));
  }

  const usersDir = path.join(dirPath, "users");
  if (await directoryExists(usersDir)) {
    const userNames = (await fs.readdir(usersDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && isAccountId(entry.name))
      .map((entry) => entry.name)
      .sort();
    for (const userId of userNames) {
      const folder = path.join(usersDir, userId);
      if (!(await directoryExists(folder))) continue;
      const names = (await fs.readdir(folder)).filter(isCorpusFile).sort();
      for (const name of names) {
        documents.push(await readFileDocument(hash, folder, name, userId));
      }
    }
  }

  if (documents.length === 0) {
    throw new Error(`No .txt, .md, or .pdf files in ${dirPath}`);
  }
  return { documents, hash: hash.digest("hex") };
}

/** Names in a docs folder, with the sample files marked so the page cannot remove them. */
export async function listCorpusFiles(dirPath) {
  const names = (await fs.readdir(dirPath)).filter(isCorpusFile).sort();
  return names.map((name) => ({ name, removable: !isProtectedDocument(name) }));
}
