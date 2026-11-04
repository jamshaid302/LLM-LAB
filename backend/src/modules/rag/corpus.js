import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Read one text file, or every .txt file in a folder. The hash covers the file
 * names and their text, so adding or editing a file changes it and a restart
 * embeds again. Names are sorted so the hash does not depend on directory order.
 */
export async function readCorpus(corpusPath) {
  const stat = await fs.stat(corpusPath);
  if (stat.isDirectory()) return readDirectory(corpusPath);

  const text = await fs.readFile(corpusPath, "utf-8");
  return {
    documents: [{ source: path.basename(corpusPath), text }],
    hash: createHash("sha256").update(text).digest("hex"),
  };
}

async function readDirectory(dirPath) {
  const names = (await fs.readdir(dirPath)).filter((name) => name.toLowerCase().endsWith(".txt")).sort();
  if (names.length === 0) {
    throw new Error(`No .txt files in ${dirPath}`);
  }

  const hash = createHash("sha256");
  const documents = [];
  for (const name of names) {
    const text = await fs.readFile(path.join(dirPath, name), "utf-8");
    hash.update(name);
    hash.update("\0");
    hash.update(text);
    hash.update("\0");
    documents.push({ source: name, text });
  }
  return { documents, hash: hash.digest("hex") };
}
