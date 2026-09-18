import { afterAll,describe,expect,it } from "vitest";
import { buildApp } from "../src/app";
const app=buildApp();
afterAll(()=>app.close());
describe("session API",()=>{it("creates a browser session and exposes only its bosses",async()=>{const created=await app.inject({method:"POST",url:"/api/session"});expect(created.statusCode).toBe(200);const cookie=created.headers["set-cookie"] as string;expect(cookie).toContain("HttpOnly");expect(cookie).toContain("SameSite=Lax");const list=await app.inject({method:"GET",url:"/api/bosses",headers:{cookie:cookie.split(";")[0]!}});expect(list.statusCode).toBe(200);expect(list.json().bosses[0].alias).toBe("모두의 상사");});it("rejects requests without a session",async()=>{const response=await app.inject({method:"GET",url:"/api/bosses"});expect(response.statusCode).toBe(401);});});
