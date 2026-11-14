export function hasOwner(userId) {
  return typeof userId === "string" && userId.trim().length > 0;
}
