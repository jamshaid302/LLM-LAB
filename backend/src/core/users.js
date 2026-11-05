/** Two local people. This is a switch, not a login. */
export const USERS = [
  { id: "local", label: "Local" },
  { id: "guest", label: "Guest" },
];

export const SHARED_OWNER = "shared";
export const DEFAULT_USER = "local";

export function knownUserId(value) {
  return USERS.some((user) => user.id === value);
}

/** A missing header is Local. Anything else is rejected by the route. */
export function userIdFromHeader(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_USER;
  return knownUserId(value) ? value : null;
}
