import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SenseCardReportSheet } from "@/components/feedback/SenseCardReportSheet";
import { freezeSenseCardDiagnosticSnapshot } from "@/lib/feedback/diagnosticReportClient";
import { gateBankGroup, gateFurnitureEntry } from "@/lib/platform/fixtures/senseCardV1GateFixture";
vi.mock("@/components/practice/ui/DialogSurface", () => ({ DialogSurface: ({children}:{children:React.ReactNode})=><div>{children}</div> }));
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
