/** One Server-Sent Events frame. The blank line is what tells the client the event ended. */
export function formatSse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Split a growing buffer into complete SSE frames. The leftover is an incomplete
 * frame that the next chunk may finish.
 */
export function consumeSseBuffer(buffer, chunk) {
  const text = buffer + chunk;
  const blocks = text.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events = [];

  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = "message";
    const dataLines = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    events.push({ event, data: dataLines.join("\n") });
  }

  return { events, rest };
}

export function beginSse(res) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
}

/**
 * Abort the model call when the client disconnects. Listening on the response,
 * and removing that listener before we end it, keeps a normal finish from
 * looking like a cancel.
 */
export function signalFromRequest(res) {
  const controller = new AbortController();
  const onClose = () => controller.abort();
  res.on("close", onClose);
  return {
    signal: controller.signal,
    detach() {
      res.off("close", onClose);
    },
  };
}

export function isAbortError(err) {
  return err?.name === "AbortError";
}
