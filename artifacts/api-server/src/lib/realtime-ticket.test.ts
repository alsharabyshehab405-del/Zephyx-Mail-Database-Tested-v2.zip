import { afterEach, describe, expect, it } from 'vitest';
import { clearRealtimeTicketsForTests, consumeRealtimeTicket, issueRealtimeTicket } from './realtime-ticket.js';

describe('realtime one-time tickets', () => {
  afterEach(async () => {
    await clearRealtimeTicketsForTests();
  });

  it('consumes a ticket exactly once and returns its bound user', async () => {
    const issued = await issueRealtimeTicket('user-ticket-a');
    expect(issued.ticket).toBeTruthy();
    expect(await consumeRealtimeTicket(issued.ticket)).toBe('user-ticket-a');
    expect(await consumeRealtimeTicket(issued.ticket)).toBeNull();
  });

  it('rejects empty and overlong ticket material', async () => {
    expect(await consumeRealtimeTicket('')).toBeNull();
    expect(await consumeRealtimeTicket('x'.repeat(129))).toBeNull();
  });
});
