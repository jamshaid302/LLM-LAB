import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { ChromaClient } from "chromadb";

export const CHROMA_COLLECTION = "lab-knowledge";

/**
 * Chroma's cosine space returns distance, where 0 is identical.
 * The rest of this module uses cosine similarity, where 1 is identical.
 */
export function similarityFromCosineDistance(distance) {
  const similarity = 1 - distance;
  if (!Number.isFinite(similarity)) {
    throw new Error(`Chroma returned a non-numeric distance: ${distance}`);
  }
  return similarity;
}

export function chromaClientArgs(url) {
  const parsed = new URL(url);
  const fallbackPort = parsed.protocol === "https:" ? 443 : 80;
  return {
    ssl: parsed.protocol === "https:",
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : fallbackPort,
  };
}

/**
 * The original in-process store. It is still the default for tests and for
 * RAG_STORE=memory. Vectors live on this object and disappear when the
 * process exits. Chroma does not replace this function.
 */
export function createMemoryStore(embeddings) {
  let vectorStore = new MemoryVectorStore(embeddings);
  let savedHash = null;

  return {
    kind: "memory",
    async status() {
      return {
        count: vectorStore.memoryVectors.length,
        corpusHash: savedHash,
      };
    },
    async replace(chunks, { corpusHash }) {
      vectorStore = new MemoryVectorStore(embeddings);
      if (chunks.length > 0) await vectorStore.addDocuments(chunks);
      savedHash = corpusHash;
    },
    async upsertSource(chunks, { source, corpusHash, owner }) {
      vectorStore.memoryVectors = vectorStore.memoryVectors.filter((item) => !sameFile(item, source, owner));
      if (chunks.length > 0) {
        const vectors = await embeddings.embedDocuments(chunks.map((chunk) => chunk.pageContent));
        await vectorStore.addVectors(vectors, chunks);
      }
      savedHash = corpusHash;
    },
    async removeSource(source, { corpusHash, owner }) {
      vectorStore.memoryVectors = vectorStore.memoryVectors.filter((item) => !sameFile(item, source, owner));
      savedHash = corpusHash;
    },
    async search(question, k, userId) {
      const total = vectorStore.memoryVectors.length;
      if (total === 0) return [];
      const results = await vectorStore.similaritySearchWithScore(question, total);
      return results
        .filter(([doc]) => visibleTo(doc.metadata?.owner, userId))
        .slice(0, k)
        .map(([doc, score]) => ({
          text: doc.pageContent,
          score,
          source: doc.metadata?.source,
          owner: doc.metadata?.owner ?? null,
        }));
    },
  };
}

/**
 * Persistent store. Embeddings are computed by the injected client (Ollama in
 * the app, a fake in tests) and sent to Chroma already as vectors.
 * embeddingFunction: null stops Chroma from loading its own ONNX model.
 */
export function createChromaStore({
  embeddings,
  url,
  collectionName = CHROMA_COLLECTION,
  client,
} = {}) {
  const chroma = client ?? new ChromaClient(chromaClientArgs(url));
  let collection = null;

  async function open() {
    if (collection) return collection;
    try {
      collection = await chroma.getOrCreateCollection({
        name: collectionName,
        embeddingFunction: null,
        configuration: { hnsw: { space: "cosine" } },
      });
    } catch (err) {
      throw connectionError(err, url);
    }
    return collection;
  }

  return {
    kind: "chroma",
    async status() {
      const current = await open();
      const count = await current.count();
      const space = current.configuration?.hnsw?.space ?? current.metadata?.space ?? null;
      return {
        count,
        corpusHash: current.metadata?.corpusHash ?? null,
        space,
      };
    },
    async replace(chunks, { corpusHash }) {
      const listed = await chroma.listCollections().catch((err) => {
        throw connectionError(err, url);
      });
      if (listed.some((item) => item.name === collectionName)) {
        await chroma.deleteCollection({ name: collectionName });
      }
      collection = await chroma.createCollection({
        name: collectionName,
        embeddingFunction: null,
        configuration: { hnsw: { space: "cosine" } },
        metadata: { corpusHash, space: "cosine" },
      });
      if (chunks.length === 0) return;

      const vectors = await embeddings.embedDocuments(chunks.map((chunk) => chunk.pageContent));
      await collection.add({
        ids: chunks.map((_, index) => `chunk-${index}`),
        documents: chunks.map((chunk) => chunk.pageContent),
        metadatas: chunks.map((chunk) => ({
          source: String(chunk.metadata?.source ?? "unknown"),
          owner: String(chunk.metadata?.owner ?? "shared"),
        })),
        embeddings: vectors,
      });
    },
    async upsertSource(chunks, { source, corpusHash, owner }) {
      const current = await open();
      await current.delete({ where: ownerFilter(source, owner) });
      if (chunks.length > 0) {
        const vectors = await embeddings.embedDocuments(chunks.map((chunk) => chunk.pageContent));
        await current.add({
          ids: chunks.map((_, index) => `${owner ?? "shared"}-${source}-${index}`),
          documents: chunks.map((chunk) => chunk.pageContent),
          metadatas: chunks.map((chunk) => ({
            source,
            owner: String(chunk.metadata?.owner ?? owner ?? "shared"),
          })),
          embeddings: vectors,
        });
      }
      await current.modify({ metadata: { ...(current.metadata ?? {}), corpusHash, space: "cosine" } });
    },
    async removeSource(source, { corpusHash, owner }) {
      const current = await open();
      await current.delete({ where: ownerFilter(source, owner) });
      await current.modify({ metadata: { ...(current.metadata ?? {}), corpusHash, space: "cosine" } });
    },
    async search(question, k, userId) {
      const current = await open();
      const query = await embeddings.embedQuery(question);
      const result = await current.query({
        queryEmbeddings: [query],
        nResults: k,
        ...(userId ? { where: { $or: [{ owner: "shared" }, { owner: userId }] } } : {}),
      });
      const documents = result.documents?.[0] ?? [];
      const metadatas = result.metadatas?.[0] ?? [];
      const distances = result.distances?.[0] ?? [];
      return documents.map((text, index) => ({
        text,
        score: similarityFromCosineDistance(distances[index]),
        source: metadatas[index]?.source,
        owner: metadatas[index]?.owner ?? null,
      }));
    },
  };
}

function sameFile(item, source, owner) {
  if (item.metadata?.source !== source) return false;
  if (!owner) return true;
  return item.metadata?.owner === owner;
}

function visibleTo(owner, userId) {
  if (!userId) return true;
  if (!owner || owner === "shared") return true;
  return owner === userId;
}

function ownerFilter(source, owner) {
  if (!owner) return { source };
  return { $and: [{ source }, { owner }] };
}

export function createVectorStore({ kind = "memory", embeddings, chromaUrl, collectionName, client }) {
  if (kind === "memory") return createMemoryStore(embeddings);
  if (kind === "chroma") {
    return createChromaStore({ embeddings, url: chromaUrl, collectionName, client });
  }
  throw new Error(`RAG_STORE must be "memory" or "chroma", got "${kind}"`);
}

function connectionError(err, url) {
  const message = err?.message ?? String(err);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|connect/i.test(message)) {
    return new Error(
      `Chroma is not reachable at ${url}. From backend/, run: docker compose up -d. ${message}`,
    );
  }
  return err;
}
