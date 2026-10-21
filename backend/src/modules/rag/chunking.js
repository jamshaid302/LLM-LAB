import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

import { config } from "../../core/config.js";

export function createSplitter({
  chunkSize = config.rag.chunkSize,
  chunkOverlap = config.rag.chunkOverlap,
} = {}) {
  if (chunkOverlap >= chunkSize) {
    throw new Error(
      `chunkOverlap (${chunkOverlap}) must be smaller than chunkSize (${chunkSize}), ` +
        "otherwise splitting cannot make progress.",
    );
  }
  return new RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap });
}

/** Splits raw text into LangChain Documents. No embedding, no network. */
export async function splitText(text, options = {}) {
  return createSplitter(options).createDocuments([text]);
}
