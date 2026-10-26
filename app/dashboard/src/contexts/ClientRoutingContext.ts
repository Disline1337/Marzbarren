import { fetch } from "service/http";
import {
  ClientRoutingResponse,
  ClientRoutingUpdate,
} from "types/ClientRouting";
import { create } from "zustand";

type ClientRoutingStore = {
  settings: ClientRoutingResponse | null;
  isLoading: boolean;
  isPostLoading: boolean;
  fetchSettings: () => Promise<void>;
  saveSettings: (body: ClientRoutingUpdate) => Promise<void>;
};

export const useClientRouting = create<ClientRoutingStore>((set) => ({
  settings: null,
  isLoading: false,
  isPostLoading: false,
  fetchSettings: () => {
    set({ isLoading: true });
    return fetch("/client-routing")
      .then((settings: ClientRoutingResponse) => set({ settings }))
      .finally(() => set({ isLoading: false }));
  },
  saveSettings: (body) => {
    set({ isPostLoading: true });
    return fetch("/client-routing", { method: "PUT", body })
      .then((settings: ClientRoutingResponse) => {
        set({ settings });
      })
      .finally(() => set({ isPostLoading: false }));
  },
}));
