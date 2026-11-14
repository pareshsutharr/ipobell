// Review flow: editors write drafts, only a super admin publishes, and what is published is locked to super admins.
// The database enforces it (20261114001500 and 20261114001600); this turns its error codes into plain words.

export function canPublish(role: string | null | undefined): boolean {
  return role === "super_admin";
}

/** A database error from saving content → what to tell the person. Other errors pass through unchanged. */
export function reviewError(message: string, what = "this"): string {
  if (/ONLY_SUPER_ADMIN_PUBLISHES/.test(message)) return "Only a super admin can publish. Save it as a draft and ask a super admin to review it.";
  if (/PUBLISHED_IS_LOCKED/.test(message)) return `Once published, ${what} can only be changed by a super admin. Ask them to unpublish it first, or to make the change.`;
  if (/SUMMARY_EMPTY/.test(message)) return "Write the one-page summary before publishing.";
  if (/row-level security/i.test(message)) return "You do not have permission to change this. Check your admin access.";
  return message;
}

/** Shown next to the Publish button for people who cannot use it. */
export const EDITOR_PUBLISH_NOTE = "You can save drafts. A super admin reviews and publishes.";
