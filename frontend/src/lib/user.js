const KEY = "lab-user";

export const USERS = [
  { id: "local", label: "Local" },
  { id: "guest", label: "Guest" },
];

let csrfToken = "";

export function currentUser() {
  const saved = window.localStorage.getItem(KEY);
  return typeof saved === "string" && /^[a-z][a-z0-9]{2,19}$/.test(saved) && saved !== "shared" ? saved : "local";
}

export function setCurrentUser(id) {
  window.localStorage.setItem(KEY, id);
  window.dispatchEvent(new Event("lab-user"));
}

export function setCsrf(token) {
  csrfToken = token || "";
}

export function userHeaders(extra = {}) {
  const headers = { ...extra, "X-User-Id": currentUser() };
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  return headers;
}
