import React from "react";
import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, expect, test, vi} from "vitest";
import {getInterfaceCatalog} from "@/lib/i18n/catalog";
import {setOnboardingLanguage} from "@/lib/onboardingI18n";
const state=vi.hoisted(()=>({getSession:vi.fn(),updateUser:vi.fn(),onAuthStateChange:vi.fn(),push:vi.fn()}));
vi.mock("@/lib/supabaseClient",()=>({supabase:{auth:state}}));
vi.mock("next/navigation",()=>({useRouter:()=>({push:state.push})}));
import ResetPasswordPage from "@/app/auth/reset-password/page";
import ConnectAuthorizePage from "@/app/connect/authorize/page";
beforeEach(()=>{
 vi.clearAllMocks();localStorage.clear();
 state.getSession.mockResolvedValue({data:{session:{user:{id:"synthetic-user",email:"test@example.invalid"},access_token:"synthetic-token"}},error:null});
 state.updateUser.mockResolvedValue({error:null});
 state.onAuthStateChange.mockReturnValue({data:{subscription:{unsubscribe:vi.fn()}}});
 vi.spyOn(console,"log").mockImplementation(()=>{});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();window.history.replaceState({},"","/");});

test.each(["en","ru","nl"] as const)("password recovery uses the %s catalog for headings, labels, buttons and validation",async language=>{
 setOnboardingLanguage(language);const copy=getInterfaceCatalog(language).features.authPages;
 render(<ResetPasswordPage/>);
 expect(await screen.findByRole("heading",{name:copy.title})).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText(copy.password),{target:{value:"abcdef"}});
 fireEvent.change(screen.getByLabelText(copy.confirmPassword),{target:{value:"different"}});
 fireEvent.click(screen.getByRole("button",{name:copy.update}));
 expect(await screen.findByText(copy.mismatch)).toBeInTheDocument();expect(state.updateUser).not.toHaveBeenCalled();
});

test("a recovery error is localized again when the interface changes, without showing provider details",async()=>{
 setOnboardingLanguage("ru");state.getSession.mockResolvedValue({data:{session:null},error:{message:"PROVIDER_RAW_DETAIL_DO_NOT_DISPLAY"}});
 render(<ResetPasswordPage/>);expect(await screen.findByText(getInterfaceCatalog("ru").features.authPages.authError)).toBeInTheDocument();
 act(()=>setOnboardingLanguage("en"));expect(await screen.findByText(getInterfaceCatalog("en").features.authPages.authError)).toBeInTheDocument();
 expect(screen.queryByText(/PROVIDER_RAW_DETAIL/)).not.toBeInTheDocument();expect(state.getSession).toHaveBeenCalledTimes(1);
});

test("connection permissions and errors use the interface catalog, not server English labels",async()=>{
 setOnboardingLanguage("ru");const copy=getInterfaceCatalog("ru").features.connect;
 window.history.replaceState({},"","/connect/authorize?response_type=code&client_id=demo&redirect_uri=https%3A%2F%2Fexample.invalid%2Fcallback&scope=platform%3Aread&code_challenge=synthetic");
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({clientId:"demo",displayName:"Demo app",clientType:"browser",redirectUri:"https://example.invalid/callback",scopes:[{id:"platform:read",label:"RAW_SERVER_ENGLISH"}],requiresPkce:true})}).mockResolvedValueOnce({ok:false,json:async()=>({error:"synthetic-failure"})});
 vi.stubGlobal("fetch",fetch);render(<ConnectAuthorizePage/>);
 expect(await screen.findByRole("heading",{name:"Подключить Demo app"})).toBeInTheDocument();
 expect(screen.getByText(copy.scopes["platform:read"])).toBeInTheDocument();expect(screen.queryByText("RAW_SERVER_ENGLISH")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:copy.approve}));expect(await screen.findByText(copy.errors.failed)).toBeInTheDocument();
 await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
});
