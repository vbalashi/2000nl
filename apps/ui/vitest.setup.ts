import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom lacks ResizeObserver; shared practice controls measure with it.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const createMemoryStorage = (): Storage => {
  const items = new Map<string, string>();

  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => Array.from(items.keys())[index] ?? null,
    removeItem: (key: string) => {
      items.delete(key);
    },
    setItem: (key: string, value: string) => {
      items.set(key, String(value));
    },
  };
};

const resolveLocalStorage = (): Storage => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Fall through to the memory-backed storage below.
  }

  return createMemoryStorage();
};

const localStorageForTests = resolveLocalStorage();

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageForTests,
  });
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageForTests,
});

// JSDOM doesn't implement matchMedia; TrainingScreen uses it for theme.
if (typeof window !== "undefined" && typeof (window as any).matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom has the dialog element but no native top-layer methods. Browser tests
// cover actual focus, backdrop and scroll behavior; unit tests need open state.
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (returnValue?: string) {
      if (returnValue !== undefined) this.returnValue = returnValue;
      this.open = false;
      this.dispatchEvent(new Event("close"));
    };
  }
}

// Public test resources, never used by the application runtime.
process.env.TRANSLATION_PROMPTS_JSON ??= "{\"openai_dictionary_explanation_repair_v1.txt\": \"Test-only resource openai_dictionary_explanation_repair_v1.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_gpt41_v4_system.txt\": \"Test-only resource openai_dictionary_meaning_gpt41_v4_system.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_gpt41_v4_user.txt\": \"Test-only resource openai_dictionary_meaning_gpt41_v4_user.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_luna6_v10_system.txt\": \"Test-only resource openai_dictionary_meaning_luna6_v10_system.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_luna6_v10_user.txt\": \"Test-only resource openai_dictionary_meaning_luna6_v10_user.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_luna6_v11_system.txt\": \"Test-only resource openai_dictionary_meaning_luna6_v11_system.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_luna6_v11_user.txt\": \"Test-only resource openai_dictionary_meaning_luna6_v11_user.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_luna6_v5_system.txt\": \"Test-only resource openai_dictionary_meaning_luna6_v5_system.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_luna6_v5_user.txt\": \"Test-only resource openai_dictionary_meaning_luna6_v5_user.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_luna6_v6_system.txt\": \"Test-only resource openai_dictionary_meaning_luna6_v6_system.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_luna6_v6_user.txt\": \"Test-only resource openai_dictionary_meaning_luna6_v6_user.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_luna6_v7_system.txt\": \"Test-only resource openai_dictionary_meaning_luna6_v7_system.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_luna6_v7_user.txt\": \"Test-only resource openai_dictionary_meaning_luna6_v7_user.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_luna6_v8_system.txt\": \"Test-only resource openai_dictionary_meaning_luna6_v8_system.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_luna6_v8_user.txt\": \"Test-only resource openai_dictionary_meaning_luna6_v8_user.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_luna6_v9_system.txt\": \"Test-only resource openai_dictionary_meaning_luna6_v9_system.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_luna6_v9_user.txt\": \"Test-only resource openai_dictionary_meaning_luna6_v9_user.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_system_v1.txt\": \"Test-only resource openai_dictionary_meaning_system_v1.txt. Return JSON matching responseFormat.\", \"openai_dictionary_meaning_user_v1.txt\": \"Test-only resource openai_dictionary_meaning_user_v1.txt. Return JSON matching responseFormat.\", \"openai_translation_system_v1.txt\": \"Test-only resource openai_translation_system_v1.txt. Return JSON matching responseFormat.\", \"openai_translation_user_instructions_v1.txt\": \"Test-only resource openai_translation_user_instructions_v1.txt. Return JSON matching responseFormat.\"}";
