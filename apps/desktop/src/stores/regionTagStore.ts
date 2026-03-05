import { create } from "zustand";
import type { RegionTag, CreateRegionTag } from "@tide/shared";
import { tagsLoad, tagsSave } from "../lib/ipc";

interface RegionTagState {
  tags: Map<string, RegionTag>;
  tagsByFile: Map<string, Set<string>>;
  staleTags: Set<string>;

  loadTagsForFile: (filePath: string) => Promise<void>;
  loadAllTags: () => Promise<void>;
  createTag: (input: CreateRegionTag) => Promise<RegionTag>;
  deleteTag: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  markStale: (id: string) => void;
  markFresh: (id: string) => void;
  getTagsForFile: (filePath: string) => RegionTag[];
}

/** Rebuild tagsByFile index from tags map */
function buildIndex(tags: Map<string, RegionTag>): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const [id, tag] of tags) {
    const set = index.get(tag.filePath) ?? new Set();
    set.add(id);
    index.set(tag.filePath, set);
  }
  return index;
}

/** Persist current tags to disk via Tauri */
async function persistTags(tags: Map<string, RegionTag>) {
  try {
    await tagsSave(Array.from(tags.values()));
  } catch (err) {
    console.error("[regionTagStore] Failed to persist tags:", err);
  }
}

export const useRegionTagStore = create<RegionTagState>((set, get) => ({
  tags: new Map(),
  tagsByFile: new Map(),
  staleTags: new Set(),

  loadTagsForFile: async (_filePath: string) => {
    // loadAllTags loads everything; filter is done by getTagsForFile
    await get().loadAllTags();
  },

  loadAllTags: async () => {
    try {
      const raw = (await tagsLoad()) as RegionTag[];
      const tags = new Map<string, RegionTag>();
      for (const t of raw) {
        tags.set(t.id, t);
      }
      set({ tags, tagsByFile: buildIndex(tags) });
    } catch (err) {
      console.error("[regionTagStore] Failed to load tags:", err);
    }
  },

  createTag: async (input: CreateRegionTag) => {
    const tag: RegionTag = {
      ...input,
      id: crypto.randomUUID(),
      pinned: input.pinned ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const tags = new Map(get().tags);
    tags.set(tag.id, tag);
    set({ tags, tagsByFile: buildIndex(tags) });
    await persistTags(tags);
    return tag;
  },

  deleteTag: async (id: string) => {
    const tags = new Map(get().tags);
    tags.delete(id);
    const staleTags = new Set(get().staleTags);
    staleTags.delete(id);
    set({ tags, tagsByFile: buildIndex(tags), staleTags });
    await persistTags(tags);
  },

  togglePin: async (id: string) => {
    const tag = get().tags.get(id);
    if (!tag) return;
    const tags = new Map(get().tags);
    tags.set(id, { ...tag, pinned: !tag.pinned, updatedAt: new Date().toISOString() });
    set({ tags });
    await persistTags(tags);
  },

  markStale: (id: string) =>
    set((state) => {
      const staleTags = new Set(state.staleTags);
      staleTags.add(id);
      return { staleTags };
    }),

  markFresh: (id: string) =>
    set((state) => {
      const staleTags = new Set(state.staleTags);
      staleTags.delete(id);
      return { staleTags };
    }),

  getTagsForFile: (filePath: string) => {
    const state = get();
    const ids = state.tagsByFile.get(filePath);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => state.tags.get(id))
      .filter((t): t is RegionTag => t !== undefined);
  },
}));
