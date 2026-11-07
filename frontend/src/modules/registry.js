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
      "Tokens, sampling, prompt patterns, and JSON the API can actually store.",
    Page: lazy(() => import("./fundamentals/FundamentalsPage.jsx")),
  },
  {
    id: "providers",
    name: "Providers & Cost",
    group: "Foundations",
    status: "ready",
    description: "Two local models behind one chat call, with tokens, latency, and a $0 price.",
    Page: lazy(() => import("./providers/ProvidersPage.jsx")),
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
    status: "ready",
    description: "Keyword plus vector search, measured against the current retriever.",
    Page: lazy(() => import("./advanced-rag/AdvancedRagPage.jsx")),
  },
  {
    id: "semantic-search",
    name: "Semantic Search",
    group: "Retrieval",
    status: "ready",
    description: "Search the knowledge base and get the chunks and scores back. No chat model.",
    Page: lazy(() => import("./semantic-search/SemanticSearchPage.jsx")),
  },
  {
    id: "documents",
    name: "Document Pipeline",
    group: "Retrieval",
    status: "ready",
    description: "Upload a file, watch it embed, and retry or remove that job.",
    Page: lazy(() => import("./documents/DocumentsPage.jsx")),
  },
  {
    id: "streaming",
    name: "Streaming Chat",
    group: "Chat & Memory",
    status: "ready",
    description: "Token-by-token responses over SSE, with cancellation and partial rendering.",
    Page: lazy(() => import("./streaming/StreamingPage.jsx")),
  },
  {
    id: "conversations",
    name: "Conversations",
    group: "Chat & Memory",
    status: "ready",
    description: "Threads and messages stored in MongoDB, then fed back into the next prompt.",
    Page: lazy(() => import("./conversations/ConversationsPage.jsx")),
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
    status: "ready",
    description: "One trace per RAG or chat request: retrieval, generation, tokens, and kept chunks.",
    Page: lazy(() => import("./observability/ObservabilityPage.jsx")),
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
