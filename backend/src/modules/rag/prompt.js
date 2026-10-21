export const NO_ANSWER = "I don't know based on the provided documents.";

/** Numbers each retrieved chunk so the model has stable labels to cite. */
export function formatContext(docs) {
  return docs.map((doc, i) => `[${i + 1}] ${doc.pageContent}`).join("\n\n");
}

export function buildRagPrompt({ question, docs }) {
  return `You are a helpful assistant. Answer the question using ONLY the context below.
If the answer isn't in the context, say "${NO_ANSWER}"
Cite source numbers like [1] or [2] in your answer.

Context:
${formatContext(docs)}

Question: ${question}

Answer:`;
}
