import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Types ───────────────────────────────────────────────────

interface ModelRef {
  provider: string;
  id: string;
  name: string;
}

interface PlanStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  files?: string[];
  assignedModel?: ModelRef;
  summary?: string;
  completedAt?: string;
}

interface Plan {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "planning" | "in_progress" | "completed" | "failed";
  steps: PlanStep[];
  initialModel?: ModelRef;
  context?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ─────────────────────────────────────────────────

function plansDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".tide", "plans");
}

function ensurePlansDir(workspaceRoot: string): void {
  const dir = plansDir(workspaceRoot);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function loadPlan(workspaceRoot: string, id: string): Plan | null {
  const dir = plansDir(workspaceRoot);
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      const plan = JSON.parse(content) as Plan;
      if (plan.id === id) return plan;
    }
  } catch { /* ignore */ }
  return null;
}

function savePlan(workspaceRoot: string, plan: Plan): void {
  ensurePlansDir(workspaceRoot);
  const filePath = path.join(plansDir(workspaceRoot), `${plan.slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(plan, null, 2), "utf-8");
}

function listPlans(workspaceRoot: string): Plan[] {
  const dir = plansDir(workspaceRoot);
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as Plan;
        } catch {
          return null;
        }
      })
      .filter((p): p is Plan => p !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

// ── Extension ───────────────────────────────────────────────

export default function tidePlanner(pi: ExtensionAPI) {
  // ── Context Injection ───────────────────────────────────
  // Inject active plan context + completed step summaries so the agent
  // knows what has been done and what remains.
  pi.on("before_agent_start", async (event, ctx) => {
    const userMessage = event.prompt || "";
    const lower = userMessage.toLowerCase();

    // Build context from active plan (if any)
    const plans = listPlans(ctx.cwd);
    const activePlan = plans.find((p) => p.status === "in_progress");

    let planContext = "";
    if (activePlan) {
      const completedSteps = activePlan.steps.filter((s) => s.status === "completed" && s.summary);
      const pendingSteps = activePlan.steps.filter((s) => s.status === "pending");
      const currentStep = activePlan.steps.find((s) => s.status === "in_progress");

      if (completedSteps.length > 0 || currentStep) {
        const lines = [
          `## Active Plan: ${activePlan.title}`,
          activePlan.description,
          "",
        ];

        if (completedSteps.length > 0) {
          lines.push("### Completed Steps:");
          for (const s of completedSteps) {
            lines.push(`- **${s.title}**: ${s.summary}`);
          }
          lines.push("");
        }

        if (currentStep) {
          lines.push(`### Current Step: ${currentStep.title}`);
          lines.push(currentStep.description);
          lines.push("");
        }

        if (pendingSteps.length > 0) {
          lines.push(`### Remaining: ${pendingSteps.map((s) => s.title).join(", ")}`);
        }

        planContext = lines.join("\n");
      }
    }

    // Inject planning instructions for complex tasks
    const complexIndicators = [
      "refactor", "architect", "redesign", "implement", "migrate",
      "rewrite", "overhaul", "restructure", "build out", "from scratch",
    ];
    const isComplex = complexIndicators.some((kw) => lower.includes(kw)) || lower.length > 500;

    const injections: string[] = [];

    if (planContext) {
      injections.push(planContext);
    }

    if (isComplex && !activePlan) {
      injections.push(
        "## Planning Mode\n\n" +
        "This appears to be a complex task. Before implementing, create a structured plan " +
        "using the `tide_plan_create` tool. Break the work into clear steps with file targets. " +
        "Update step status with `tide_plan_update` as you complete each step. " +
        "When finishing a step, use `tide_plan_step_summary` to record what was done.",
      );
    }

    if (injections.length > 0) {
      const existing = event.systemPrompt || "";
      return { systemPrompt: existing + "\n\n" + injections.join("\n\n") };
    }
  });

  // ── Tool: Create Plan ───────────────────────────────────

  pi.registerTool({
    name: "tide_plan_create",
    description:
      "Create a structured implementation plan for a complex task. " +
      "The plan is saved to .tide/plans/ and displayed in the Plan tab.",
    parameters: Type.Object({
      title: Type.String({ description: "Plan title" }),
      description: Type.String({ description: "Brief description of the overall goal" }),
      steps: Type.Array(
        Type.Object({
          title: Type.String({ description: "Step title" }),
          description: Type.String({ description: "What this step accomplishes" }),
          files: Type.Optional(Type.Array(Type.String({ description: "Target file paths" }))),
          assignedModel: Type.Optional(
            Type.Object({
              provider: Type.String({ description: "Model provider (e.g. openai, anthropic)" }),
              id: Type.String({ description: "Model ID (e.g. gpt-5, claude-sonnet-4-6)" }),
              name: Type.String({ description: "Display name" }),
            }),
          ),
        }),
        { description: "Ordered list of implementation steps" },
      ),
      context: Type.Optional(Type.String({ description: "Project context or notes for agents working on this plan" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Capture current model as the plan's initial model
      const currentModel = ctx.model;
      const initialModel: ModelRef | undefined = currentModel
        ? { provider: currentModel.provider, id: currentModel.id, name: (currentModel as any).name || currentModel.id }
        : undefined;

      const plan: Plan = {
        id: crypto.randomUUID(),
        slug: slugify(params.title),
        title: params.title,
        description: params.description,
        status: "in_progress",
        steps: params.steps.map((s, i) => ({
          id: `step-${i + 1}`,
          title: s.title,
          description: s.description,
          status: "pending" as const,
          files: s.files,
          assignedModel: s.assignedModel,
        })),
        initialModel,
        context: params.context,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      savePlan(ctx.cwd, plan);
      ctx.ui.setStatus("planner", JSON.stringify(plan));

      return {
        content: [
          {
            type: "text" as const,
            text: `Created plan "${plan.title}" with ${plan.steps.length} steps (${plan.id})`,
          },
        ],
        details: { planId: plan.id, slug: plan.slug },
      };
    },
  });

  // ── Tool: Update Plan Step ──────────────────────────────

  pi.registerTool({
    name: "tide_plan_update",
    description:
      "Update the status of a plan step. Use this to mark steps as in_progress, completed, or skipped.",
    parameters: Type.Object({
      planId: Type.String({ description: "Plan ID" }),
      stepId: Type.String({ description: "Step ID (e.g. step-1)" }),
      status: Type.Union(
        [
          Type.Literal("pending"),
          Type.Literal("in_progress"),
          Type.Literal("completed"),
          Type.Literal("skipped"),
        ],
        { description: "New step status" },
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const plan = loadPlan(ctx.cwd, params.planId);
      if (!plan) {
        return {
          content: [{ type: "text" as const, text: `Plan not found: ${params.planId}` }],
          isError: true,
        };
      }

      const step = plan.steps.find((s) => s.id === params.stepId);
      if (!step) {
        return {
          content: [{ type: "text" as const, text: `Step not found: ${params.stepId}` }],
          isError: true,
        };
      }

      step.status = params.status;
      if (params.status === "completed" && !step.completedAt) {
        step.completedAt = new Date().toISOString();
      }
      plan.updatedAt = new Date().toISOString();

      const allCompleted = plan.steps.every(
        (s) => s.status === "completed" || s.status === "skipped",
      );
      const anyInProgress = plan.steps.some((s) => s.status === "in_progress");

      if (allCompleted) {
        plan.status = "completed";
      } else if (anyInProgress) {
        plan.status = "in_progress";
      }

      savePlan(ctx.cwd, plan);
      ctx.ui.setStatus("planner", JSON.stringify(plan));

      return {
        content: [
          {
            type: "text" as const,
            text: `Updated ${params.stepId} to "${params.status}" in plan "${plan.title}"`,
          },
        ],
        details: { plan },
      };
    },
  });

  // ── Tool: Step Summary ──────────────────────────────────

  pi.registerTool({
    name: "tide_plan_step_summary",
    description:
      "Record a summary of what was accomplished in a plan step. " +
      "This summary is passed as context to agents working on subsequent steps, " +
      "so they understand what has been done without needing full conversation history.",
    parameters: Type.Object({
      planId: Type.String({ description: "Plan ID" }),
      stepId: Type.String({ description: "Step ID (e.g. step-1)" }),
      summary: Type.String({ description: "Brief summary of what was done (1-3 sentences)" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const plan = loadPlan(ctx.cwd, params.planId);
      if (!plan) {
        return {
          content: [{ type: "text" as const, text: `Plan not found: ${params.planId}` }],
          isError: true,
        };
      }

      const step = plan.steps.find((s) => s.id === params.stepId);
      if (!step) {
        return {
          content: [{ type: "text" as const, text: `Step not found: ${params.stepId}` }],
          isError: true,
        };
      }

      step.summary = params.summary;
      if (!step.completedAt) {
        step.completedAt = new Date().toISOString();
      }
      plan.updatedAt = new Date().toISOString();

      savePlan(ctx.cwd, plan);
      ctx.ui.setStatus("planner", JSON.stringify(plan));

      return {
        content: [
          {
            type: "text" as const,
            text: `Saved summary for ${params.stepId}: "${params.summary.slice(0, 100)}${params.summary.length > 100 ? "..." : ""}"`,
          },
        ],
      };
    },
  });

  // ── Tool: List Plans ────────────────────────────────────

  pi.registerTool({
    name: "tide_plan_list",
    description: "List all plans in the workspace.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const plans = listPlans(ctx.cwd);
      const summaries = plans.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        status: p.status,
        steps: p.steps.length,
        completed: p.steps.filter((s) => s.status === "completed").length,
        updatedAt: p.updatedAt,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(summaries, null, 2) }],
        details: { count: plans.length },
      };
    },
  });
}
