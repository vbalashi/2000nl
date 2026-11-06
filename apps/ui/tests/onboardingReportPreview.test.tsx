import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ONBOARDING_PAUSE, ONBOARDING_SIGNAL } from "@/lib/onboarding/signals";
import { SenseCardReportSheet } from "@/components/feedback/SenseCardReportSheet";
import { freezeSenseCardDiagnosticSnapshot } from "@/lib/feedback/diagnosticReportClient";
import { gateBankGroup, gateFurnitureEntry } from "@/lib/platform/fixtures/senseCardV1GateFixture";
vi.mock("@/components/practice/ui/DialogSurface", () => ({ DialogSurface: ({children,onCancel,onDismiss}:{children:React.ReactNode;onCancel:React.ReactEventHandler<HTMLDialogElement>;onDismiss:()=>void})=><dialog open onCancel={onCancel} onClick={event=>{if(event.target===event.currentTarget)onDismiss();}}>{children}</dialog> }));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
test("the actual report form can be explored with delivery disabled", () => {
 const close=vi.fn(),fetchSpy=vi.spyOn(globalThis,"fetch"),storageSpy=vi.spyOn(Storage.prototype,"setItem");
 render(<SenseCardReportSheet snapshot={freezeSenseCardDiagnosticSnapshot({route:"training",group:gateBankGroup,entry:gateFurnitureEntry})} interfaceLanguage="ru" deliveryEnabled={false} onClose={close}/>);
 fireEvent.click(screen.getAllByRole("radio")[0]);
 fireEvent.change(screen.getByRole("textbox"),{target:{value:"Synthetic preview issue"}});
 const send=screen.getByRole("button",{name:"Отправить"});
 expect(send).toBeDisabled();fireEvent.click(send);
 expect(fetchSpy).not.toHaveBeenCalled();expect(storageSpy).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Назад"}));expect(close).toHaveBeenCalledOnce();
});

test("Escape dismisses the report and notifies the guide", () => {
 const close=vi.fn(), listener=vi.fn();
 window.addEventListener(ONBOARDING_SIGNAL,listener);
 render(<SenseCardReportSheet snapshot={freezeSenseCardDiagnosticSnapshot({route:"training",group:gateBankGroup,entry:gateFurnitureEntry})} interfaceLanguage="en" deliveryEnabled={false} onClose={close}/>);
 const slot=document.querySelector('[data-onboarding="report-guide-slot"]');
 expect(slot).toHaveAttribute("aria-live","polite");
 fireEvent(screen.getByRole("dialog"),new Event("cancel",{bubbles:false,cancelable:true}));
 expect(close).toHaveBeenCalledOnce();
 expect(listener).toHaveBeenCalledOnce();
 expect((listener.mock.calls[0][0] as CustomEvent).detail).toBe("report-dismissed");
 window.removeEventListener(ONBOARDING_SIGNAL,listener);
});

test("backdrop dismissal advances the guide, but pausing does not", () => {
 const listener=vi.fn();window.addEventListener(ONBOARDING_SIGNAL,listener);
 const props={snapshot:freezeSenseCardDiagnosticSnapshot({route:"training",group:gateBankGroup,entry:gateFurnitureEntry}),interfaceLanguage:"en" as const,deliveryEnabled:false,onClose:vi.fn()};
 const view=render(<SenseCardReportSheet {...props}/>);
 fireEvent.click(screen.getByRole("dialog"));
 expect(listener).toHaveBeenCalledOnce();
 expect((listener.mock.calls[0][0] as CustomEvent).detail).toBe("report-dismissed");
 view.unmount();listener.mockClear();
 render(<SenseCardReportSheet {...props}/>);
 window.dispatchEvent(new Event(ONBOARDING_PAUSE));
 fireEvent.click(screen.getByRole("dialog"));
 expect(listener).not.toHaveBeenCalled();
 window.removeEventListener(ONBOARDING_SIGNAL,listener);
});
