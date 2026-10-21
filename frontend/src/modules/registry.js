import { lazy } from "react";

/**
 * One entry per platform module. `ready` modules have a page and a backend router at
 * /api/<id>; `planned` ones show up in the sidebar so the roadmap is visible in the app.
 * Group order here controls sidebar order.
 */
export const modules = [
  {
    id: "fundamentals",
    name: "LLM Fundamentals",
    group: "Foundations",
    status: "ready",
    description:
      "Tokens, temperature, top-p, and seed. Change one setting and watch the answer change.",
    Page: lazy(() => import("./fundamentals/FundamentalsPage.jsx")),
  },
  {
    id: "providers",
    name: "Providers & Cost",
    group: "Foundations",
    status: "planned",
    description:
      "Local and hosted models behind one interface, with fallbacks, caching, and token accounting.",
  },
  {
    id: "rag",
    name: "RAG",
    group: "Retrieval",
    status: "ready",
    description: "Retrieval-augmented generation over a local knowledge base.",
    Page: lazy(() => import("./rag/RagPage.jsx")),
  },
  {
    id: "advanced-rag",
    name: "Advanced RAG",
    group: "Retrieval",
    status: "planned",
    description: "Hybrid search, reranking, and query rewriting, measured against basic RAG.",
  },
  {
    id: "semantic-search",
    name: "Semantic Search",
    group: "Retrieval",
    status: "planned",
    description:
      "Embeddings outside of chat: search, deduplication, clustering, and recommendations.",
  },
  {
    id: "documents",
    name: "Document Pipeline",
    group: "Retrieval",
    status: "planned",
    description: "PDF and Markdown upload, parsing, and embedding as background jobs with progress.",
  },
  {
    id: "streaming",
    name: "Streaming Chat",
    group: "Chat & Memory",
    status: "planned",
    description: "Token-by-token responses over SSE, with cancellation and partial rendering.",
  },
  {
    id: "conversations",
    name: "Conversations",
    group: "Chat & Memory",
    status: "planned",
    description:
      "Threads and messages stored in MongoDB, with summarization and semantic recall of past chats.",
  },
  {
    id: "evaluation",
    name: "LLM Evaluation",
    group: "Quality",
    status: "planned",
    description: "Golden datasets, retrieval metrics, and LLM-as-judge scoring with regression gates.",
  },
  {
    id: "hallucination",
    name: "Hallucination Detection",
    group: "Quality",
    status: "planned",
    description: "Faithfulness checks and citation verification for generated answers.",
  },
  {
    id: "agents",
    name: "AI Agents",
    group: "Agents",
    status: "planned",
    description: "Tool calling, a bounded reasoning loop, workflows, and agent evaluation.",
  },
  {
    id: "multi-agent",
    name: "Multi-Agent Systems",
    group: "Agents",
    status: "planned",
    description: "Agents that hand off and coordinate, and when that is worth the overhead.",
  },
  {
    id: "security",
    name: "Security",
    group: "Production",
    status: "planned",
    description:
      "Prompt injection defenses, PII handling, output sanitization, and per-user data isolation.",
  },
  {
    id: "observability",
    name: "Observability",
    group: "Production",
    status: "planned",
    description: "Tracing a request through retrieval and generation, with latency and token costs.",
  },
  {
    id: "deployment",
    name: "Deployment",
    group: "Production",
    status: "planned",
    description: "Docker, CI, rate limiting, and graceful degradation when a model is unavailable.",
  },
  {
    id: "multimodal",
    name: "Multimodal AI",
    group: "Advanced",
    status: "planned",
    description: "Vision and audio models running locally, and quantization trade-offs.",
  },
  {
    id: "fine-tuning",
    name: "Fine-Tuning",
    group: "Advanced",
    status: "planned",
    description: "SFT, LoRA, and QLoRA on a GPU worker, compared against the base model.",
  },
];

export const defaultModuleId = "fundamentals";

export function findModule(id) {
  return modules.find((m) => m.id === id);
}
