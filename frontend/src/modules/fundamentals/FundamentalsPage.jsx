import { useState } from "react";

const DEFAULT_PROMPT = "Invent a one-sentence tagline for a neighborhood coffee shop.";

const DEFAULT_TASK =
  'A customer wrote: "The app crashed twice and nobody replied for three days." What is the sentiment, and what should support do next?';

const PRESETS = [
  { id: "precise", label: "Precise", temperature: 0, topP: 0.9, seed: "1" },
  { id: "creative", label: "Creative", temperature: 1.2, topP: 0.95, seed: "" },
];

export default function FundamentalsPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [system, setSystem] = useState("");
  const [temperature, setTemperature] = useState(0);
  const [topP, setTopP] = useState(0.9);
  const [maxTokens, setMaxTokens] = useState(160);
  const [seed, setSeed] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [runs, setRuns] = useState([]);
  const [task, setTask] = useState(DEFAULT_TASK);
  const [patternRuns, setPatternRuns] = useState([]);

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/fundamentals/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          system,
          ...samplingBody(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRuns((prev) => [data, ...prev].slice(0, 6));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function samplingBody() {
    return {
      temperature: Number(temperature),
      topP: Number(topP),
      maxTokens: Number(maxTokens),
      seed: seed === "" ? undefined : Number(seed),
    };
  }

  async function comparePatterns() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/fundamentals/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, ...samplingBody() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPatternRuns(data.runs);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="playground">
      <p className="lesson">
        Temperature 0 always picks the most likely next token, so the same prompt repeats.
        Raise it and the model starts sampling less likely tokens. A seed makes that
        sampling repeatable. Run the precise preset twice, then the creative one twice.
      </p>

      <div className="preset-row">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="ghost-btn"
            onClick={() => {
              setTemperature(preset.temperature);
              setTopP(preset.topP);
              setSeed(preset.seed);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <label className="field">
        <span>System prompt (optional)</span>
        <input
          value={system}
          onChange={(e) => setSystem(e.target.value)}
          placeholder="Answer in one sentence."
        />
      </label>

      <label className="field">
        <span>Prompt</span>
        <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </label>

      <div className="controls">
        <label className="field">
          <span>Temperature {Number(temperature).toFixed(1)}</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Top-p {Number(topP).toFixed(2)}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={topP}
            onChange={(e) => setTopP(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Max tokens</span>
          <input
            type="number"
            min="1"
            max="512"
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Seed</span>
          <input
            type="number"
            min="0"
            value={seed}
            placeholder="none"
            onChange={(e) => setSeed(e.target.value)}
          />
        </label>
      </div>

      <button type="button" className="primary-btn" onClick={run} disabled={loading || !prompt.trim()}>
        {loading ? "Generating..." : "Run"}
      </button>
      {error && <p className="error">{error}</p>}

      <div className="runs">
        {runs.map((runResult, index) => (
          <article key={index} className="run">
            <header>
              <span>
                temperature {runResult.settings.temperature} · top-p {runResult.settings.topP}
                {runResult.settings.seed !== undefined ? ` · seed ${runResult.settings.seed}` : " · no seed"}
              </span>
              <span className="muted">{runResult.model}</span>
            </header>
            <p>{runResult.text}</p>
            <footer>
              prompt {runResult.tokens.prompt} tokens · completion {runResult.tokens.completion} tokens ·
              estimate {runResult.tokens.estimated} · {runResult.durationMs} ms
            </footer>
          </article>
        ))}
      </div>

      <h2>Prompt patterns</h2>
      <p className="lesson">
        The same task, four ways of asking. Set temperature to 0 and keep the seed, so the
        only thing that changes is the prompt. Zero-shot is the task alone. Role demands a
        shape. Few-shot shows two finished examples. Chain-of-thought asks for the
        reasoning before the answer. Open "Prompt sent" on a card to see the exact messages.
      </p>

      <label className="field">
        <span>Task</span>
        <textarea rows={3} value={task} onChange={(e) => setTask(e.target.value)} />
      </label>

      <button
        type="button"
        className="primary-btn"
        onClick={comparePatterns}
        disabled={loading || !task.trim()}
      >
        {loading ? "Generating..." : "Compare patterns"}
      </button>

      <div className="pattern-grid">
        {patternRuns.map((runResult) => (
          <article key={runResult.pattern} className="run">
            <header>
              <strong>{runResult.label}</strong>
              <span className="muted">
                {(runResult.tokens.prompt ?? 0) + (runResult.tokens.completion ?? 0)} tokens · {runResult.durationMs} ms
              </span>
            </header>
            <p>{runResult.text}</p>
            <details>
              <summary>Prompt sent</summary>
              <pre>
                {runResult.messages
                  .map((message) => `${message.role}: ${message.content}`)
                  .join("\n\n")}
              </pre>
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}
