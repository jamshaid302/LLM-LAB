import { HttpError } from "../../core/http.js";

export const PATTERN_IDS = ["zero-shot", "role", "few-shot", "chain-of-thought"];

const ROLE_SYSTEM = `You are a support lead. Answer in exactly this shape and nothing else:
Sentiment: <positive, negative, or mixed>
Next step: <one sentence>`;

const FEW_SHOT_SYSTEM = `Classify the customer's sentiment and give one next step for support.
Use exactly this shape:
Sentiment: <positive, negative, or mixed>
Next step: <one sentence>`;

const FEW_SHOT_EXAMPLES = [
  {
    user: "The delivery arrived early and the box was intact.",
    assistant: "Sentiment: positive\nNext step: Thank them and ask for a short review.",
  },
  {
    user: "I was charged twice and the second charge is still there.",
    assistant: "Sentiment: negative\nNext step: Refund the duplicate charge and email a confirmation.",
  },
];

const CHAIN_OF_THOUGHT_SYSTEM = `Work through the task step by step in a few short sentences.
End with a final line that starts with "Answer:".`;

function requireTask(task) {
  const text = typeof task === "string" ? task.trim() : "";
  if (!text) throw new HttpError(400, "Missing 'task'");
  if (text.length > 2000) throw new HttpError(400, "Task must be at most 2000 characters");
  return text;
}

/** Builds the messages for one prompting pattern. The task is always the last user turn. */
export function buildPattern(pattern, task) {
  const text = requireTask(task);

  if (pattern === "zero-shot") {
    return {
      id: pattern,
      label: "Zero-shot",
      messages: [{ role: "user", content: text }],
    };
  }

  if (pattern === "role") {
    return {
      id: pattern,
      label: "Role",
      messages: [
        { role: "system", content: ROLE_SYSTEM },
        { role: "user", content: text },
      ],
    };
  }

  if (pattern === "few-shot") {
    const messages = [{ role: "system", content: FEW_SHOT_SYSTEM }];
    for (const example of FEW_SHOT_EXAMPLES) {
      messages.push({ role: "user", content: example.user });
      messages.push({ role: "assistant", content: example.assistant });
    }
    messages.push({ role: "user", content: text });
    return { id: pattern, label: "Few-shot", messages };
  }

  if (pattern === "chain-of-thought") {
    return {
      id: pattern,
      label: "Chain-of-thought",
      messages: [
        { role: "system", content: CHAIN_OF_THOUGHT_SYSTEM },
        { role: "user", content: text },
      ],
    };
  }

  throw new HttpError(400, `Unknown pattern "${pattern}". Use ${PATTERN_IDS.join(", ")}.`);
}

export function buildAllPatterns(task) {
  return PATTERN_IDS.map((id) => buildPattern(id, task));
}
