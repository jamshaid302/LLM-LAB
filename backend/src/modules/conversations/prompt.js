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
export function buildConversationMessages({ history, docs }) {
  const blocks = (docs ?? []).map((doc, index) => {
    const source = doc.source ? ` (${doc.source})` : "";
    return `[${index + 1}]${source} ${doc.text}`;
  });

  const system = blocks.length
    ? [
        "You are continuing a conversation.",
        "Answer from the earlier messages when they already contain the fact.",
        "Use the documents below for a fact the transcript does not contain.",
        "Say you don't know only when neither the transcript nor the documents has the fact.",
        "",
        "Documents:",
        blocks.join("\n\n"),
      ].join("\n")
    : [
        "You are continuing a conversation.",
        "Answer from the earlier messages when they already contain the fact.",
        "Say you don't know only when the transcript never stated it.",
      ].join(" ");

  return [
    { role: "system", content: system },
    ...history.map((message) => ({ role: message.role, content: message.content })),
  ];
}
