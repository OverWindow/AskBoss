import { render,screen } from "@testing-library/react";import { describe,expect,it } from "vitest";import { PkiIndicator } from "./PkiIndicator";
const globalBoss:any={id:"g",scope:"GLOBAL",status:"READY",alias:"모두의 상사",avatarKey:"boss-male-01",persona:null,pki:null};
describe("PkiIndicator",()=>{it("hides persona progress for the global boss",()=>{render(<PkiIndicator boss={globalBoss}/>);expect(screen.queryByText("기본 페르소나")).not.toBeInTheDocument();expect(screen.queryByText("특정 실제 인물을 모델링하지 않은 공통 상사예요.")).not.toBeInTheDocument();});});
