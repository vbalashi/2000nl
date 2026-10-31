import type { ReactElement } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, type Mock } from "vitest";

/** Runs against mounted production renderers and the real current-card hook.
 * Only the transport and content providers are replaced by synthetic fixtures. */
export function trainingLifecyclePresentationContract(family: string, prepare: () => {
  view: (active: boolean,blocked?:boolean,refreshing?:boolean) => ReactElement;
  read: Mock;
  acknowledge: Mock;
  action: Mock;
  target: { sessionId: string; entryId: string; cardTypeId: string };
}) {
  describe(`${family}: shared lifecycle presentation contract`, () => {
    test("a hidden pane cannot acknowledge; visible presentation waits for authoritative ACK", async () => {
      vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED", "true");
      try {
        const adapter = prepare();
        let release!: (permit: object) => void;
        adapter.acknowledge.mockReset().mockImplementation(() => new Promise(resolve => { release = resolve; }));
        const mounted = render(adapter.view(false));
        await waitFor(() => expect(adapter.read).toHaveBeenCalled());
        expect(adapter.acknowledge).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Show answer" })).not.toBeInTheDocument();
        mounted.rerender(adapter.view(true));
        await waitFor(() => expect(adapter.acknowledge).toHaveBeenCalledOnce());
        expect(adapter.acknowledge.mock.calls[0][1]).toMatchObject(adapter.target);
        expect(screen.queryByRole("button", { name: "Show answer" })).not.toBeInTheDocument();
        expect(adapter.action).not.toHaveBeenCalled();
        await act(async () => release({permitId:"75300000-0000-4000-8000-000000000001",expiresAt:new Date(Date.now()+60_000).toISOString(),runGeneration:1}));
        expect(await screen.findByRole("button", { name: "Show answer" })).toBeVisible();
        expect(adapter.action).not.toHaveBeenCalled();
      } finally { vi.unstubAllEnvs(); }
    });

    test("authority validation fences a mounted card without replacing its display target",async()=>{
      vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED","true");
      try{
        const adapter=prepare();adapter.acknowledge.mockReset().mockResolvedValue({permitId:"permit",expiresAt:new Date(Date.now()+60_000).toISOString(),runGeneration:1});
        const mounted=render(adapter.view(true));await screen.findByRole("button",{name:"Show answer"});
        mounted.rerender(adapter.view(true,true,true));
        expect(screen.getByRole("button",{name:"Show answer"})).toBeDisabled();
        expect(document.querySelector("[data-authority-refreshing]")).not.toBeNull();
        expect(adapter.acknowledge).toHaveBeenCalledOnce();expect(adapter.action).not.toHaveBeenCalled();
        mounted.rerender(adapter.view(true,false,false));expect(screen.getByRole("button",{name:"Show answer"})).toBeEnabled();
      }finally{vi.unstubAllEnvs();}
    });

    test("an ACK arriving while hidden cannot authorize a returned pane", async () => {
      vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED", "true");
      try {
        const adapter = prepare();
        const responses: Array<(permit: object) => void> = [];
        adapter.acknowledge.mockReset().mockImplementation(() => new Promise(resolve => { responses.push(resolve); }));
        const mounted = render(adapter.view(true));
        await waitFor(() => expect(adapter.acknowledge).toHaveBeenCalledOnce());
        mounted.rerender(adapter.view(false));
        await act(async () => responses[0]({permitId:"old-permit",expiresAt:new Date(Date.now()+60_000).toISOString(),runGeneration:1}));
        mounted.rerender(adapter.view(true));
        await waitFor(() => expect(adapter.acknowledge).toHaveBeenCalledTimes(2));
        expect(screen.queryByRole("button", { name: "Show answer" })).not.toBeInTheDocument();
        await act(async () => responses[1]({permitId:"new-permit",expiresAt:new Date(Date.now()+60_000).toISOString(),runGeneration:1}));
        expect(await screen.findByRole("button", { name: "Show answer" })).toBeVisible();
        expect(adapter.action).not.toHaveBeenCalled();
      } finally { vi.unstubAllEnvs(); }
    });

    test("a late display ACK cannot revive an unmounted presentation or issue an action", async () => {
      vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED", "true");
      try {
        const adapter = prepare();
        let release!: (permit: object) => void;
        adapter.acknowledge.mockReset().mockImplementation(() => new Promise(resolve => { release = resolve; }));
        const mounted = render(adapter.view(true));
        await waitFor(() => expect(adapter.acknowledge).toHaveBeenCalledOnce());
        mounted.unmount();
        await act(async () => release({permitId:"75300000-0000-4000-8000-000000000001",expiresAt:new Date(Date.now()+60_000).toISOString(),runGeneration:1}));
        expect(screen.queryByRole("button", { name: "Show answer" })).not.toBeInTheDocument();
        expect(adapter.action).not.toHaveBeenCalled();
      } finally { vi.unstubAllEnvs(); }
    });
  });
}
