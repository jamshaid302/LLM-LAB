import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { splitText } from "../../../src/modules/rag/chunking.js";
import { lessonReply, searchAsWritten } from "../../../src/modules/rag/lesson.js";

const guidePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../src/modules/rag/docs/learning-guide.md",
);

async function guideHits() {
  const text = await readFile(guidePath, "utf8");
  const chunks = await splitText(text);
  return chunks.map((chunk) => ({ text: chunk.pageContent, source: "learning-guide.md", score: 0.8 }));
}

describe("lessonReply", () => {
  it("returns the matching lesson, including the lab page", async () => {
    const hits = await guideHits();
    expect(lessonReply("What is RAG?", hits)).toContain("does not retrain");
    expect(lessonReply("What is RAG?", hits)).toContain("RAG page");
    expect(lessonReply("What is RAG?", hits)).not.toContain("How does RAG work");
    expect(lessonReply("How can I learn RAG?", hits)).not.toContain("Concepts behind");
    expect(lessonReply("How does RAG work?", hits)).toContain("cross-encoder");
    expect(lessonReply("How does RAG work?", hits)).toContain("Advanced RAG");
    expect(lessonReply("How can I learn RAG?", hits)).toContain("Learning Path");
    expect(lessonReply("How can I learn RAG?", hits)).toContain("Score question set");
    expect(lessonReply("What are LLMs, and how do they work?", hits)).toContain("next token");
    expect(lessonReply("What are LLMs, and how do they work?", hits)).toContain("LLM Fundamentals");
    expect(lessonReply("What are the different concepts and technologies behind Generative AI?", hits)).toContain(
      "Fine-tuning",
    );
    expect(lessonReply("What is generative AI?", hits)).toContain("Learning Path");
  });

  it("does not answer a learning question with a different lesson", async () => {
    const hits = (await guideHits()).filter((hit) => hit.text.includes("## What is RAG?"));
    expect(lessonReply("How can I learn RAG?", hits)).toBeNull();
    expect(searchAsWritten("How can I learn RAG?")).toBe(true);
    expect(searchAsWritten("What is the password?")).toBe(false);
  });

  it("leaves a question the guide does not answer to the model", async () => {
    const hits = await guideHits();
    hits.unshift({ text: "The company gym is on the 3rd floor.", source: "knowledge.txt", score: 0.9 });
    expect(lessonReply("Where is the company gym?", hits)).toBeNull();
  });
});
