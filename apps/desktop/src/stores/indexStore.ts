import { create } from "zustand";
import { indexStatus, type IndexStats } from "../lib/ipc";

interface IndexState {
  indexed: boolean;
  indexing: boolean;
  fileCount: number;
  symbolCount: number;
  lastIndexedAt: string | null;
  progressPercent: number;
  progressFile: string;

  refreshStatus: () => Promise<void>;
  updateProgress: (done: number, total: number, currentFile: string) => void;
  updateFromStats: (stats: IndexStats) => void;
}

export const useIndexStore = create<IndexState>((set) => ({
  indexed: false,
  indexing: false,
  fileCount: 0,
  symbolCount: 0,
  lastIndexedAt: null,
  progressPercent: 0,
  progressFile: "",

  refreshStatus: async () => {
    try {
      const stats = await indexStatus();
      set({
        indexed: stats.indexed,
        indexing: stats.indexingInProgress,
        fileCount: stats.fileCount,
        symbolCount: stats.symbolCount,
        lastIndexedAt: stats.lastIndexedAt,
      });
    } catch {
      // Index not available yet
    }
  },

  updateProgress: (done: number, total: number, currentFile: string) => {
    set({
      indexing: done < total,
      progressPercent: total > 0 ? (done / total) * 100 : 0,
      progressFile: currentFile,
    });
  },

  updateFromStats: (stats: IndexStats) => {
    set({
      indexed: stats.indexed,
      indexing: stats.indexingInProgress,
      fileCount: stats.fileCount,
      symbolCount: stats.symbolCount,
      lastIndexedAt: stats.lastIndexedAt,
    });
  },
}));
