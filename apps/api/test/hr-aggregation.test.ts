import { describe,expect,it } from "vitest";
import { computeSurfaceActualGap,computeTopRepeatedPhrases } from "../src/utils/hr-aggregation";

describe("HR aggregation",()=>{
  it("uses the AI gap score and aggregates it by boss",()=>{
    const rows=[
      {inputText:"좋은 의견이네요.",plainMeaning:"수정이 필요합니다.",surfaceActualGapScore:80,bossId:"boss-1",alias:"김 팀장"},
      {inputText:"바로 고쳐 주세요.",plainMeaning:"수정이 필요합니다.",surfaceActualGapScore:5,bossId:"boss-1",alias:"김 팀장"},
      {inputText:"검토해 볼게요.",plainMeaning:"사실상 보류입니다.",surfaceActualGapScore:70,bossId:"boss-1",alias:"김 팀장"},
    ];
    expect(computeSurfaceActualGap(rows)).toEqual({rate:66.7,byBoss:[{bossId:"boss-1",alias:"김 팀장",rate:66.7,gapCount:2,total:3}]});
  });

  it("counts repeated simulation inputs",()=>{
    expect(computeTopRepeatedPhrases([{inputText:"이거 언제 되나?"},{inputText:" 이거  언제 되나? "},{inputText:"다른 말"}])).toEqual([{phrase:"이거 언제 되나?",count:2}]);
  });
});
