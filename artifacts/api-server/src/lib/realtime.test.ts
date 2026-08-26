import { afterEach, describe, expect, it } from "vitest";
import { clearRealtimeStateForTests, publishUserEvent, replayUserEvents, subscribeToUserEvents } from "./realtime.js";

describe("realtime user isolation", () => {
  afterEach(async () => clearRealtimeStateForTests());
  it("delivers and replays events only for the owning user", async () => {
    const userA: string[] = []; const userB: string[] = [];
    const stopA = subscribeToUserEvents("user-a", (event) => userA.push(event.id));
    const stopB = subscribeToUserEvents("user-b", (event) => userB.push(event.id));
    const eventA = await publishUserEvent("user-a", { event: "email.updated", data: { emailId: "email-a", change: "updated" } });
    const eventB = await publishUserEvent("user-b", { event: "email.created", data: { emailId: "email-b", change: "created" } });
    const eventA2 = await publishUserEvent("user-a", { event: "notification.updated", data: { notificationId: "notification-a", change: "updated" } });
    stopA(); stopB();
    expect(userA).toEqual([eventA.id, eventA2.id]); expect(userB).toEqual([eventB.id]);
    expect(await replayUserEvents("user-a")).toEqual([eventA, eventA2]);
    expect(await replayUserEvents("user-a", eventA.id)).toEqual([eventA2]);
    expect(await replayUserEvents("user-b", eventA.id)).toHaveLength(0);
  });
});
