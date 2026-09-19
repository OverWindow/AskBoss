import { describe,expect,it } from "vitest";
import { validateStep } from "./steps";

const draft={
  profile:{handle:"ab",ageBand:30,yearsOfServiceBand:"",jobFunction:"",rank:"",entryPath:"",weaknesses:[]},
  boss:{alias:"",avatarKey:"boss-male-01",jobFunction:"",yearsOfServiceBand:"",rank:"",companyName:"",ageBand:40,hierarchyScore:50},
};

describe("validateStep",()=>{
  it("사용자 ID 오류를 한국어로 안내한다",()=>{
    expect(validateStep("U1",draft)).toBe("사용자 ID는 3~20자의 한글, 영문, 숫자, 밑줄(_), 하이픈(-)으로 입력해 주세요.");
  });

  it("상사 이름 누락을 한국어로 안내한다",()=>{
    expect(validateStep("B2",draft)).toBe("상사를 부를 이름을 입력해 주세요.");
  });

  it("올바른 상사 이름은 통과시킨다",()=>{
    expect(validateStep("B2",{...draft,boss:{...draft.boss,alias:"김부장"}})).toBeNull();
  });
});
