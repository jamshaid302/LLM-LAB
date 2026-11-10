import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { readCorpus } from "../../../src/modules/rag/corpus.js";

describe("document owners", () => {
  it("reads a registered person's folder and ignores a reserved name", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rag-owners-"));
    await fs.writeFile(path.join(dir, "knowledge.txt"), "shared gym");
    await fs.mkdir(path.join(dir, "users", "sam"), { recursive: true });
    await fs.mkdir(path.join(dir, "users", "shared"), { recursive: true });
    await fs.writeFile(path.join(dir, "users", "sam", "note.md"), "sam maple");
    await fs.writeFile(path.join(dir, "users", "shared", "nope.md"), "not an account");

    const corpus = await readCorpus(dir);
    expect(corpus.documents.map((document) => document.owner).sort()).toEqual(["sam", "shared"]);
    expect(corpus.documents.find((document) => document.owner === "sam").text).toContain("sam maple");
  });
});
