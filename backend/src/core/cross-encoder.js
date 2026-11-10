import fs from "node:fs/promises";
import path from "node:path";

import { backendRoot, config } from "./config.js";

/**
 * A cross-encoder reads the question and one passage together and returns one relevance
 * number per pair. Higher is more relevant. The numbers are logits, not cosine scores,
 * so they only order hits; the 0.5 cutoff still uses the cosine score on each hit.
 *
 * `load` is injected so tests never download a model.
 */
export function createCrossEncoder({
  model = config.rerank.model,
  cacheDir = config.rerank.cacheDir || path.join(backendRoot, ".cache", "models"),
  load = loadTransformersModel,
} = {}) {
  let ready = null;

  function open() {
    if (!ready) {
      ready = load({ model, cacheDir }).catch((err) => {
        ready = null;
        throw err;
      });
    }
    return ready;
  }

  return {
    model,
    async score(query, passages) {
      if (passages.length === 0) return [];
      const runner = await open();
      const scores = await runner(String(query), passages.map((text) => String(text ?? "")));
      if (!Array.isArray(scores) || scores.length !== passages.length) {
        throw new Error(`Cross-encoder returned ${scores?.length ?? 0} scores for ${passages.length} passages`);
      }
      return scores;
    },
  };
}

/** Orders hits by the cross-encoder. Each hit keeps its cosine `score` and gains `rerankScore`. */
export async function rerankWithCrossEncoder(hits, query, encoder) {
  if (hits.length === 0) return [];
  const scores = await encoder.score(query, hits.map((hit) => hit.text));
  return hits
    .map((hit, index) => ({ ...hit, rerankScore: scores[index] }))
    .sort(
      (a, b) =>
        b.rerankScore - a.rerankScore || (b.score ?? -1) - (a.score ?? -1) || String(a.text).localeCompare(String(b.text)),
    );
}

const MODEL_FILES = ["tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"];
const MAX_TOKENS = 512;
const MAX_PASSAGE_CHARS = 1500;

/** Downloads the three files once into the cache folder, then reads them from disk. */
export async function ensureModelFiles({ model, cacheDir, fetchImpl = fetch }) {
  const dir = path.join(cacheDir, ...model.split("/"));
  const paths = {};
  for (const file of MODEL_FILES) {
    const target = path.join(dir, ...file.split("/"));
    paths[file] = target;
    try {
      await fs.access(target);
      continue;
    } catch {
      // Not cached yet.
    }
    const url = `https://huggingface.co/${model}/resolve/main/${file}`;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`Could not download ${url}: HTTP ${res.status}`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, Buffer.from(await res.arrayBuffer()));
  }
  return paths;
}

/**
 * WebAssembly ONNX runtime, so no native DLL or Python is needed. The model is the
 * 8-bit quantized MiniLM cross-encoder trained on MS MARCO question and passage pairs.
 */
async function loadTransformersModel({ model, cacheDir }) {
  const files = await ensureModelFiles({ model, cacheDir });
  const [{ Tokenizer }, ort] = await Promise.all([import("@huggingface/tokenizers"), import("onnxruntime-web")]);
  const tokenizer = new Tokenizer(
    JSON.parse(await fs.readFile(files["tokenizer.json"], "utf8")),
    JSON.parse(await fs.readFile(files["tokenizer_config.json"], "utf8")),
  );
  const session = await ort.InferenceSession.create(await fs.readFile(files["onnx/model_quantized.onnx"]));

  return async (query, passages) => {
    const encoded = passages.map((passage) => {
      const result = tokenizer.encode(query, {
        text_pair: passage.slice(0, MAX_PASSAGE_CHARS),
        return_token_type_ids: true,
      });
      return {
        ids: result.ids.slice(0, MAX_TOKENS),
        mask: result.attention_mask.slice(0, MAX_TOKENS),
        types: result.token_type_ids.slice(0, MAX_TOKENS),
      };
    });
    const width = Math.max(...encoded.map((row) => row.ids.length));
    const tensor = (key) => {
      const data = new BigInt64Array(encoded.length * width);
      encoded.forEach((row, r) => row[key].forEach((value, c) => (data[r * width + c] = BigInt(value))));
      return new ort.Tensor("int64", data, [encoded.length, width]);
    };
    const feeds = {};
    const inputs = { input_ids: "ids", attention_mask: "mask", token_type_ids: "types" };
    for (const name of session.inputNames) {
      if (inputs[name]) feeds[name] = tensor(inputs[name]);
    }
    const output = await session.run(feeds);
    const logits = output[session.outputNames[0]];
    const columns = logits.dims[1] ?? 1;
    return Array.from({ length: encoded.length }, (_, r) => Number(logits.data[r * columns]));
  };
}
