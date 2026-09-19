import { describe,expect,it } from "vitest";
import { MemoryStore } from "../src/repositories/memory-store";

describe("meaningless session maintenance",()=>{
  it("deletes only old sessions without user data",async()=>{
    const store=new MemoryStore();
    const future=new Date(Date.now()+86_400_000).toISOString();
    const abandoned=await store.createSession("abandoned",future);
    abandoned.lastSeenAt=new Date(Date.now()-2*86_400_000).toISOString();
    await store.createSession("recent",future);
    const withProfile=await store.createSession("with-profile",future);
    withProfile.lastSeenAt=abandoned.lastSeenAt;
    await store.upsertProfile(withProfile.id,{handle:"tester",ageBand:30,yearsOfServiceBand:"3~4년",jobFunction:"개발",rank:"대리",entryPath:"신입",weaknesses:[]});

    expect(await store.pruneMeaninglessSessions()).toMatchObject({deleted:1});
    expect(await store.findSession("abandoned")).toBeNull();
    expect(await store.findSession("recent")).not.toBeNull();
    expect(await store.findSession("with-profile")).not.toBeNull();
  });
});
