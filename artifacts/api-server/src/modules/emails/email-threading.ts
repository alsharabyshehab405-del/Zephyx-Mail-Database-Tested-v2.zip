import type { EmailAddress } from "@workspace/db";

const REPLY_PREFIX = /^\s*(?:re|رد)\s*:\s*/i;
const THREAD_PREFIX = /^\s*(?:(?:re|fw|fwd|رد)\s*:\s*)+/i;

export type ThreadCandidate = {
  id: string;
  subject: string;
  threadId: string | null;
  replyToId: string | null;
  fromEmail: string;
  toAddresses: EmailAddress[];
  isDraft: boolean;
  createdAt: Date;
};

type FindParentOptions = {
  subject: string;
  excludeId?: string;
  participantEmails?: string[];
  before?: Date;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isReplySubject(subject: string): boolean {
  return REPLY_PREFIX.test(subject);
}

export function normalizeThreadSubject(subject: string): string {
  return subject.replace(THREAD_PREFIX, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function getThreadParticipantEmails(
  message: Pick<ThreadCandidate, "fromEmail" | "toAddresses">,
): string[] {
  return [message.fromEmail, ...message.toAddresses.map((address) => address.email)]
    .map(normalizeEmail)
    .filter(Boolean);
}

export function findSubjectThreadParent(
  candidates: ThreadCandidate[],
  options: FindParentOptions,
): ThreadCandidate | null {
  if (!isReplySubject(options.subject)) {
    return null;
  }

  const normalizedSubject = normalizeThreadSubject(options.subject);

  if (!normalizedSubject) {
    return null;
  }

  const participantEmails = new Set(
    (options.participantEmails ?? []).map(normalizeEmail).filter(Boolean),
  );

  const matches = candidates.filter((candidate) => {
    if (
      candidate.id === options.excludeId ||
      candidate.isDraft ||
      normalizeThreadSubject(candidate.subject) !== normalizedSubject
    ) {
      return false;
    }

    if (options.before && candidate.createdAt >= options.before) {
      return false;
    }

    if (participantEmails.size === 0) {
      return true;
    }

    return getThreadParticipantEmails(candidate).some((email) => participantEmails.has(email));
  });

  return matches.find((candidate) => !isReplySubject(candidate.subject)) ?? matches[0] ?? null;
}
