import { describe,expect,it } from "vitest";
import { classifyRankGap,classifyRepeatedSimulation,computeRepeatedSimulationTypes,computeSurfaceActualGap } from "../src/utils/hr-aggregation";

describe("HR aggregation",()=>{
  it("splits rank gaps into individual steps through four and groups five or more",()=>{
    expect(classifyRankGap("대리","대리")).toBe("0단계");
    expect(classifyRankGap("사원","대리")).toBe("2단계");
    expect(classifyRankGap("인턴","과장")).toBe("4단계");
    expect(classifyRankGap("인턴","대표")).toBe("5단계+");
    expect(classifyRankGap("기타","대표")).toBeNull();
  });

  it("uses the AI gap score and aggregates it by boss",()=>{
    const rows=[
      {inputText:"좋은 의견이네요.",plainMeaning:"수정이 필요합니다.",surfaceActualGapScore:80,bossId:"boss-1",alias:"김 팀장"},
      {inputText:"바로 고쳐 주세요.",plainMeaning:"수정이 필요합니다.",surfaceActualGapScore:5,bossId:"boss-1",alias:"김 팀장"},
      {inputText:"검토해 볼게요.",plainMeaning:"사실상 보류입니다.",surfaceActualGapScore:70,bossId:"boss-1",alias:"김 팀장"},
    ];
    expect(computeSurfaceActualGap(rows)).toEqual({rate:66.7,byBoss:[{bossId:"boss-1",alias:"김 팀장",rate:66.7,gapCount:2,total:3}]});
  });

  it("groups only repeated simulation inputs without returning their text",()=>{
    const result=computeRepeatedSimulationTypes([
      {inputText:"이거 언제 되나?",simulationCount:1},
      {inputText:" 이거  언제 되나? ",simulationCount:2},
      {inputText:"오늘까지 가능해?",simulationCount:2},
      {inputText:"한 번만 본 말",simulationCount:1},
      {inputText:"특별한 단서가 없는 말",simulationCount:2},
    ]);
    expect(result).toEqual([
      {type:"일정·마감 압박",count:5},
      {type:"기타",count:2},
    ]);
    expect(JSON.stringify(result)).not.toContain("언제 되나");
  });

  it("uses the fixed classification priority",()=>{
    expect(classifyRepeatedSimulation("왜 아직 일정이 늦었나요?")).toBe("질책·성과 압박");
    expect(classifyRepeatedSimulation("초안을 빨리 보여 주세요.")).toBe("일정·마감 압박");
    expect(classifyRepeatedSimulation("회의 전에 결론을 정리해 주세요.")).toBe("의사결정·승인");
    expect(classifyRepeatedSimulation("알아서 정리해서 공유해 주세요.")).toBe("업무 위임·책임 요구");
  });
});
