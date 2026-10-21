import { useState } from "react";

const DEFAULT_PROMPT = "Invent a one-sentence tagline for a neighborhood coffee shop.";

const PRESETS = [
  { id: "precise", label: "Precise", temperature: 0, topP: 0.9, seed: "1" },
  { id: "creative", label: "Creative", temperature: 1.2, topP: 0.95, seed: "" },
];

export default function FundamentalsPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [system, setSystem] = useState("");
  const [temperature, setTemperature] = useState(0);
  const [topP, setTopP] = useState(0.9);
  const [maxTokens, setMaxTokens] = useState(64);
  const [seed, setSeed] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [runs, setRuns] = useState([]);

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
          temperature: Number(temperature),
          topP: Number(topP),
          maxTokens: Number(maxTokens),
          seed: seed === "" ? undefined : Number(seed),
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
    </div>
  );
}
