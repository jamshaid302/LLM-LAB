/**
 * Split off the messages that no longer fit in the prompt. The cut moves forward
 * until the kept window starts on a user message, so a reply is not left behind
 * without the question it answered.
 */
export function chooseFold({ messages, summarizedCount = 0, limit }) {
  const pending = messages.slice(summarizedCount);
  if (pending.length <= limit) {
    return { toFold: [], recent: pending, summarizedCount };
  }

  let foldEnd = pending.length - limit;
  while (foldEnd < pending.length - 1 && pending[foldEnd].role !== "user") foldEnd += 1;

  return {
    toFold: pending.slice(0, foldEnd),
    recent: pending.slice(foldEnd),
    summarizedCount: summarizedCount + foldEnd,
  };
}

/** The model call that folds older turns into one paragraph. */
export function buildSummaryMessages({ previousSummary, messages }) {
  const lines = messages.map((message) => {
    const speaker = message.role === "user" ? "User" : "Assistant";
    return `${speaker}: ${message.content}`;
  });
  const prior = previousSummary ? `Summary so far:\n${previousSummary}\n\n` : "";

  return [
    {
      role: "system",
      content: [
        "Summarize this conversation so a later reply can rely on it.",
        "Keep every name, number, and decision, including every fact already in the summary so far.",
        "Do not drop a fact just because the new messages do not repeat it.",
        "Do not add anything that was not stated.",
        "Write one short paragraph and do not use the labels User or Assistant.",
      ].join(" "),
    },
    { role: "user", content: `${prior}New messages:\n${lines.join("\n")}` },
  ];
}

/**
 * The model call that turns a follow-up into a search query. The reply prompt still
 * uses the original message.
 */
export function buildRewriteMessages({ summary, messages, question }) {
  const lines = (messages ?? []).map((message) => {
    const speaker = message.role === "user" ? "User" : "Assistant";
    return `${speaker}: ${message.content}`;
  });
  const prior = [
    summary ? `Summary:\n${summary}` : "",
    lines.length ? `Earlier messages:\n${lines.join("\n")}` : "",
    `Latest message:\n${question}`,
  ].filter(Boolean);

  return [
    {
      role: "system",
      content: [
        "Rewrite the latest user message as one search query for a document database.",
        "Replace words like it, that, or the password with the specific subject named in the earlier messages or the summary.",
        "Do not answer the question.",
        "Reply with the search query only, on one line.",
      ].join(" "),
    },
    { role: "user", content: prior.join("\n\n") },
  ];
}

/** Keep a one-line query. A blank or essay-length rewrite falls back to the original message. */
export function searchQueryFromRewrite(text, fallback) {
  const line = String(text ?? "")
    .trim()
    .split("\n")[0]
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!line || line.length > 300) return fallback;
  return line;
}

/** Keep the newest turns, and don't start the window on an orphaned assistant reply. */
export function recentTurns(messages, limit) {
  const slice = messages.slice(-limit);
  while (slice.length > 1 && slice[0].role !== "user") slice.shift();
  return slice;
}

/**
 * The next model call. Earlier messages come from MongoDB. Document chunks, when
 * retrieval found any, come from the vector store and are not saved as messages.
 */
export function buildConversationMessages({ history, docs, summary }) {
  const blocks = (docs ?? []).map((doc, index) => {
    const source = doc.source ? ` (${doc.source})` : "";
    return `[${index + 1}]${source} ${doc.text}`;
  });

  const sources = ["the transcript", summary ? "the summary" : "", blocks.length ? "the documents" : ""].filter(Boolean);
  const refusal = sources.length === 1
    ? "Say you don't know only when the transcript never stated it."
    : `Say you don't know only when neither ${sources.join(" nor ")} has the fact.`;

  const lines = [
    "You are continuing a conversation.",
    "Answer from the earlier messages when they already contain the fact.",
    summary ? "A summary of messages older than the transcript is included below. Treat it as what was already said." : "",
    blocks.length ? "Use the documents below for a fact the transcript does not contain." : "",
    refusal,
    summary ? `\nSummary of earlier messages:\n${summary}` : "",
    blocks.length ? `\nDocuments:\n${blocks.join("\n\n")}` : "",
  ];
  const system = lines.filter(Boolean).join("\n");

  return [
    { role: "system", content: system },
    ...history.map((message) => ({ role: message.role, content: message.content })),
  ];
}
