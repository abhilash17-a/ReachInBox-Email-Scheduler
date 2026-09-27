import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env.js';

export const es = new Client({ node: env.ELASTICSEARCH_URL });
const INDEX = 'emails';

export async function ensureEmailIndex() {
  try {
    const exists = await es.indices.exists({ index: INDEX });
    if (!exists) {
      await es.indices.create({
        index: INDEX,
        mappings: {
          properties: {
            recipient: { type: 'text' },
            subject: { type: 'text' },
            body: { type: 'text' },
            status: { type: 'keyword' },
            senderId: { type: 'keyword' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
            userId: { type: 'keyword' },
            emailId: { type: 'keyword' },
            isStarred: { type: 'boolean' }
          }
        }
      });
    }
  } catch (error) {
    console.warn('Elasticsearch unavailable; search will retry later.', error instanceof Error ? error.message : error);
  }
}

export async function indexEmails(emails: any[]) {
  if (emails.length === 0) return;
  try {
    const operations: any[] = [];
    for (const email of emails) {
      operations.push({ index: { _index: INDEX, _id: email.id } });
      operations.push({
        emailId: email.id,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
        status: email.status,
        senderId: email.senderId,
        scheduledAt: email.scheduledAt,
        sentAt: email.sentAt,
        userId: email.userId,
        isStarred: email.isStarred ?? false
      });
    }
    const result = await es.bulk({ operations, refresh: 'wait_for' });
    if (result.errors) {
      const failures = result.items.filter((item: any) => item.index?.error).length;
      console.warn(`Elasticsearch indexing failed for ${failures} email(s).`);
    }
  } catch (error) {
    console.warn('Elasticsearch indexing failed:', error instanceof Error ? error.message : error);
  }
}

export async function indexEmail(email: any) {
  await indexEmails([email]);
}

export async function removeEmailIndex(emailId: string) {
  try {
    await es.delete({ index: INDEX, id: emailId, refresh: true });
  } catch (error: any) {
    if (error?.meta?.statusCode !== 404) console.warn('Elasticsearch delete failed:', error instanceof Error ? error.message : error);
  }
}

export async function searchEmails(userId: string, q: string) {
  try {
    const response = await es.search({
      index: INDEX,
      query: {
        bool: {
          must: [{ multi_match: { query: q, fields: ['recipient^3', 'subject^2', 'body', 'status'] } }],
          filter: [{ term: { userId } }]
        }
      },
      sort: [{ _score: { order: 'desc' } }]
    });
    return response.hits.hits.map((hit) => ({ ...(hit._source as any), id: (hit._source as any)?.emailId }));
  } catch {
    return [];
  }
}
