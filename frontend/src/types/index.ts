export interface User { id: string; name: string; email: string; avatarUrl?: string | null; slackConnected?: boolean; senders?: Sender[]; }
export interface Sender { id: string; email: string; displayName?: string | null; active: boolean; }
export interface Email { id: string; recipient: string; subject: string; body: string; status: string; scheduledAt: string; sentAt?: string | null; failedAt?: string | null; previewUrl?: string | null; error?: string | null; senderId: string; isStarred?: boolean; }
