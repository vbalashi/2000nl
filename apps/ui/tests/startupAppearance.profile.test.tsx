import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountPracticeAppearanceProvider, useAccountPracticeAppearance } from "@/components/practice/ui/AccountPracticeAppearanceProvider";
import { readStartupAppearance, STARTUP_COOKIE } from "@/lib/preferences/startupAppearance";
function Probe() { const a=useAccountPracticeAppearance(); return <><button onClick={()=>void a?.save("indigo")}>Save indigo</button><output>{a?.loadStatus}/{a?.saveStatus}</output></>; }
beforeEach(()=>{document.cookie=`${STARTUP_COOKIE}=; Max-Age=0; Path=/`;vi.stubGlobal("matchMedia",()=>({matches:false}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();document.cookie=`${STARTUP_COOKIE}=; Max-Age=0; Path=/`;});
test.each([true,false])("cache tracks confirmed profile and only successful saves (%s)",async success=>{
 const repository={load:vi.fn().mockResolvedValue("blue"),save:success?vi.fn().mockResolvedValue(undefined):vi.fn().mockRejectedValue(new Error("failed"))};
 render(<AccountPracticeAppearanceProvider userId="test" repository={repository}><Probe/></AccountPracticeAppearanceProvider>);
 await waitFor(()=>expect(screen.getByText("ready/idle")).toBeInTheDocument());
 expect(readStartupAppearance(document.cookie)?.palette).toBe("blue");
 fireEvent.click(screen.getByRole("button",{name:"Save indigo"}));
 await screen.findByText(success?"ready/saved":"ready/error");
 expect(readStartupAppearance(document.cookie)?.palette).toBe(success?"indigo":"blue");
});
