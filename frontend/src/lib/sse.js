/** Split a fetch stream into complete Server-Sent Events. */
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

export async function readSse(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const consumed = consumeSseBuffer(buffer, decoder.decode(value, { stream: true }));
    buffer = consumed.rest;
    for (const frame of consumed.events) {
      onEvent(frame.event, frame.data ? JSON.parse(frame.data) : {});
    }
  }
}
