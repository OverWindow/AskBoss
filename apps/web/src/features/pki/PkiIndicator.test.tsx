import { render,screen } from "@testing-library/react";import { describe,expect,it } from "vitest";import { PkiIndicator } from "./PkiIndicator";
const globalBoss:any={id:"g",scope:"GLOBAL",status:"READY",alias:"모두의 상사",avatarKey:"boss-male-01",persona:null,pki:null};
describe("PkiIndicator",()=>{it("does not invent a numeric PKI for the global persona",()=>{render(<PkiIndicator boss={globalBoss}/>);expect(screen.getByText("기본 페르소나")).toBeInTheDocument();expect(screen.getByText("참고용")).toBeInTheDocument();});});
