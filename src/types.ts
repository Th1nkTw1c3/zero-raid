export interface UnreadMsg {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  needsReply: boolean;
  messageId: string;
}

export interface RoomData {
  id: string;
  name: string;
  unread: UnreadMsg[];
}

export interface RoomsResponse {
  demo: boolean;
  rooms: RoomData[];
}

export interface StatusResponse {
  mode: 'gmail' | 'demo' | 'unauth';
  demo: boolean;
  connected: boolean;
  email?: string;
}

export type RaidAction = 'archive' | 'trash' | 'star';
