/** Built-in people. A registered account uses the same id rules. */
export const USERS = [
  { id: "local", label: "Local" },
  { id: "guest", label: "Guest" },
];

export const SHARED_OWNER = "shared";
export const DEFAULT_USER = "local";

const ACCOUNT_ID = /^[a-z][a-z0-9]{2,19}$/;

/** A person id. "shared" is the sample-file owner, so it cannot be an account. */
export function isAccountId(value) {
  return typeof value === "string" && ACCOUNT_ID.test(value) && value !== SHARED_OWNER;
}

export function knownUserId(value) {
  return USERS.some((user) => user.id === value);
}

/** A missing header is Local. A header other than local or guest is rejected. */
export function userIdFromHeader(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_USER;
  return knownUserId(value) ? value : null;
}

/**
 * The session wins. A route mounted without login still accepts only the header
 * switch, so a spoofed name stays rejected.
 */
export function userIdFromRequest(req) {
  if (isAccountId(req?.labUserId)) return req.labUserId;
  return userIdFromHeader(req?.get?.("X-User-Id"));
}
