import { z } from "zod";

export const RegionTagSchema = z.object({
  id: z.string().uuid(),
  filePath: z.string(),
  startLine: z.number().int().min(1),
  startColumn: z.number().int().min(1),
  endLine: z.number().int().min(1),
  endColumn: z.number().int().min(1),
  label: z.string().min(1),
  note: z.string().optional(),
  pinned: z.boolean().default(false),
  contentHash: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RegionTag = z.infer<typeof RegionTagSchema>;

export const CreateRegionTagSchema = z.object({
  filePath: z.string(),
  startLine: z.number().int().min(1),
  startColumn: z.number().int().min(1),
  endLine: z.number().int().min(1),
  endColumn: z.number().int().min(1),
  label: z.string().min(1),
  note: z.string().optional(),
  pinned: z.boolean().default(false),
  contentHash: z.string(),
});

export type CreateRegionTag = z.infer<typeof CreateRegionTagSchema>;

export const UpdateRegionTagSchema = z.object({
  label: z.string().min(1).optional(),
  note: z.string().optional(),
  pinned: z.boolean().optional(),
  startLine: z.number().int().min(1).optional(),
  startColumn: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
  endColumn: z.number().int().min(1).optional(),
  contentHash: z.string().optional(),
});

export type UpdateRegionTag = z.infer<typeof UpdateRegionTagSchema>;
