const KEY = "lab-user";

export const USERS = [
  { id: "local", label: "Local" },
  { id: "guest", label: "Guest" },
];

export function currentUser() {
  const saved = window.localStorage.getItem(KEY);
  return USERS.some((user) => user.id === saved) ? saved : "local";
}

export function setCurrentUser(id) {
  window.localStorage.setItem(KEY, id);
  window.dispatchEvent(new Event("lab-user"));
}

export function userHeaders(extra = {}) {
  return { ...extra, "X-User-Id": currentUser() };
}
