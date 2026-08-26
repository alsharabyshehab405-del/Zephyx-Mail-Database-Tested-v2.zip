export type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export type GmailProfile = {
  emailAddress?: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId?: string;
};

export type GmailMessageReference = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
};

export type GmailMessageListResponse = {
  messages?: GmailMessageReference[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type GmailHistoryEntry = {
  id?: string;
  messagesAdded?: Array<{ message?: GmailMessageReference }>;
};

export type GmailHistoryListResponse = {
  history?: GmailHistoryEntry[];
  nextPageToken?: string;
  historyId?: string;
};

export type GmailHeader = {
  name?: string;
  value?: string;
};

export type GmailMessagePartBody = {
  attachmentId?: string;
  size?: number;
  data?: string;
};

export type GmailMessagePart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailMessagePartBody;
  parts?: GmailMessagePart[];
};

export type GmailMessage = GmailMessageReference & {
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
  sizeEstimate?: number;
};
