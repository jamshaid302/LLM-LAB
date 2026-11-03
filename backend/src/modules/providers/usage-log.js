const MAX_CALLS = 50;

export function createUsageLog() {
  const calls = [];
  let next = 1;

  return {
    add(record) {
      const saved = {
        id: `usage-${next}`,
        createdAt: new Date().toISOString(),
        ...record,
      };
      next += 1;
      calls.unshift(saved);
      if (calls.length > MAX_CALLS) calls.pop();
      return saved;
    },
    list() {
      return calls.map((call) => ({ ...call }));
    },
  };
}
