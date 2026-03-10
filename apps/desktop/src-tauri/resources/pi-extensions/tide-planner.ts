import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { classifyPrompt } from "./tide-classify.js";

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
  dependencies?: string[];
  expectedOutcome?: string;
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
  let isOrchestrated = false;

  // ── Context Injection ───────────────────────────────────
  // Inject active plan context + completed step summaries so the agent
  // knows what has been done and what remains.
  pi.on("before_agent_start", async (event, ctx) => {
    const userMessage = event.prompt || "";

    // Skip planning context injection during orchestration —
    // the orchestrator already provides curated context in each step prompt
    isOrchestrated = userMessage.trimStart().startsWith("[tide:orchestrated]");
    if (isOrchestrated) return;

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

    // Use the router's unified classification instead of duplicating keyword lists
    const { tier } = classifyPrompt(userMessage, ctx.cwd);
    const isComplex = tier === "complex";

    const injections: string[] = [];

    if (planContext) {
      injections.push(planContext);
    }

    if (isComplex && !activePlan) {
      injections.push(
        "## Planning Mode\n\n" +
        "This is a complex task. Follow these steps IN ORDER before writing any code:\n\n" +
        "### Step 1: Explore\n" +
        "Use Read, Glob, and Grep tools to understand the current codebase architecture. " +
        "Identify existing patterns, conventions, relevant files, and potential impact areas. " +
        "Pay special attention to how similar features are already implemented. Do NOT skip this.\n\n" +
        "### Step 2: Clarify\n" +
        "If there are ambiguities about scope, approach, or user preferences, call `tide_plan_clarify` " +
        "with specific questions. Each question should have 2-4 concrete suggested answers. " +
        "Examples: technology choices, scope boundaries, error handling strategy, testing approach.\n\n" +
        "### Step 3: Create Plan\n" +
        "Call `tide_plan_create` with a DETAILED plan. Each step MUST include:\n" +
        "- **Specific file paths** for every file to create or modify\n" +
        "- **Detailed description**: not just 'Update X' but exactly what changes, why, and how\n" +
        "- **Dependencies**: which step IDs must complete before this one can start\n" +
        "- **Expected outcome**: what the codebase should look like after this step\n" +
        "- **Atomic scope**: each step should be small enough that a different model could execute it " +
        "with only the step description and plan context (no conversation history needed)\n\n" +
        "### Step 4: Execute\n" +
        "Work through each step sequentially. Before each step:\n" +
        "1. Call `tide_plan_update` to mark the step `in_progress`\n" +
        "2. Implement the changes\n" +
        "3. Call `tide_plan_step_summary` with a concise summary of what was done\n" +
        "4. Call `tide_plan_update` to mark it `completed`\n\n" +
        "IMPORTANT: Do NOT skip the exploration phase. Plans without thorough codebase understanding are always shallow.",
      );
    }

    // When there IS an active plan, tell the model how to revise it
    if (activePlan) {
      injections.push(
        "## Plan Revision\n\n" +
        "An active plan exists. If the user asks to **enhance, revise, edit, refine, redo, or add more details** " +
        "to the plan, use `tide_plan_revise` with the existing plan ID (`" + activePlan.id + "`) — " +
        "do NOT create a new plan with `tide_plan_create`. " +
        "`tide_plan_revise` preserves the plan ID, slug, and completion status of matching steps.\n\n" +
        "Only use `tide_plan_create` when the user explicitly wants a completely new/separate plan.",
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
    label: "Create Plan",
    description:
      "Create a structured implementation plan for a complex task. " +
      "The plan is saved to .tide/plans/ and displayed in the Plan tab.",
    promptSnippet: "Create a structured implementation plan with steps",
    promptGuidelines: [
      "Each step should be atomic — small enough for a single agent to execute with only the step description",
      "Include specific file paths, not vague references like 'update the config'",
      "Set dependencies between steps when order matters",
    ],
    parameters: Type.Object({
      title: Type.String({ description: "Plan title" }),
      description: Type.String({ description: "Brief description of the overall goal" }),
      steps: Type.Array(
        Type.Object({
          title: Type.String({ description: "Step title" }),
          description: Type.String({ description: "Detailed description: what changes, why, and how" }),
          files: Type.Optional(Type.Array(Type.String({ description: "Target file paths (create or modify)" }))),
          dependencies: Type.Optional(Type.Array(Type.String({ description: "IDs of steps that must complete first (e.g. 'step-1')" }))),
          expectedOutcome: Type.Optional(Type.String({ description: "What the codebase should look like after this step" })),
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
          dependencies: s.dependencies,
          expectedOutcome: s.expectedOutcome,
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

  // ── Tool: Clarify Before Planning ─────────────────────

  pi.registerTool({
    name: "tide_plan_clarify",
    label: "Clarify Plan",
    description:
      "Ask the user clarifying questions before creating a plan. " +
      "Each question has suggested answers the user can pick from, plus optional free-text input. " +
      "This tool blocks until the user responds. Use when you need to narrow down scope, " +
      "technology choices, or approach before planning.",
    promptSnippet: "Ask clarifying questions before planning (blocks for user input)",
    promptGuidelines: [
      "Each question should have 2-4 concrete suggested answers",
      "Use specific question IDs like 'auth_approach' or 'test_strategy'",
      "Only ask questions that meaningfully affect the plan — skip obvious ones",
    ],
    parameters: Type.Object({
      questions: Type.Array(
        Type.Object({
          id: Type.String({ description: "Unique question identifier (e.g. 'auth_approach')" }),
          question: Type.String({ description: "The question to ask the user" }),
          options: Type.Array(
            Type.Object({
              value: Type.String({ description: "Option value returned in the answer" }),
              label: Type.String({ description: "Display label for the option" }),
              description: Type.Optional(Type.String({ description: "Brief explanation of this option" })),
            }),
            { description: "2-4 suggested answers" },
          ),
          allowFreeText: Type.Optional(Type.Boolean({ description: "Allow custom text input (default true)" })),
        }),
        { description: "List of clarifying questions" },
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // During orchestration, skip clarification — proceed with best judgment
      if (isOrchestrated) {
        return {
          content: [{ type: "text" as const, text: "Skipping clarification (orchestrated mode) — proceed with best judgment." }],
        };
      }

      // Broadcast full question set to frontend for rendering
      ctx.ui.setStatus("clarify", JSON.stringify({ questions: params.questions }));

      // Load clarify timeout from orchestrator config
      let timeoutSecs = 120;
      try {
        const configPath = path.join(ctx.cwd, ".tide", "orchestrator-config.json");
        if (fs.existsSync(configPath)) {
          const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          if (typeof cfg.clarifyTimeoutSecs === "number") {
            timeoutSecs = cfg.clarifyTimeoutSecs;
          }
        }
      } catch { /* use default */ }

      // Block until user responds, with optional timeout to prevent orchestration hangs
      const TIMEOUT_SENTINEL = "__CLARIFY_TIMEOUT__";
      let response: string | undefined;
      const inputPromise = ctx.ui.input("Plan Clarification", "Waiting for your answers...");

      if (timeoutSecs > 0) {
        const timeoutPromise = new Promise<string>((resolve) =>
          setTimeout(() => resolve(TIMEOUT_SENTINEL), timeoutSecs * 1000),
        );
        response = await Promise.race([inputPromise, timeoutPromise]);
      } else {
        response = await inputPromise;
      }

      // Clear the clarify status
      ctx.ui.setStatus("clarify", undefined);

      if (response === TIMEOUT_SENTINEL) {
        return {
          content: [{ type: "text" as const, text: `Clarification timed out after ${timeoutSecs}s — proceeding with best judgment.` }],
        };
      }

      if (!response) {
        return {
          content: [{ type: "text" as const, text: "User skipped clarification — proceeding with best judgment." }],
        };
      }

      // Response is a JSON string of { questionId: selectedValue }
      let answers: Record<string, string>;
      try {
        answers = JSON.parse(response);
      } catch {
        answers = { raw: response };
      }

      const formatted = Object.entries(answers)
        .map(([qId, answer]) => {
          const q = params.questions.find((q) => q.id === qId);
          return `- **${q?.question || qId}**: ${answer}`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `User's answers to clarifying questions:\n${formatted}`,
          },
        ],
        details: { answers },
      };
    },
  });

  // ── Tool: Update Plan Step ──────────────────────────────

  pi.registerTool({
    name: "tide_plan_update",
    label: "Update Step",
    description:
      "Update the status of a plan step. Use this to mark steps as in_progress, completed, or skipped.",
    promptSnippet: "Update a plan step status (pending/in_progress/completed/skipped)",
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
    label: "Step Summary",
    description:
      "Record a summary of what was accomplished in a plan step. " +
      "This summary is passed as context to agents working on subsequent steps, " +
      "so they understand what has been done without needing full conversation history.",
    promptSnippet: "Record what was done in a plan step (for cross-step context)",
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

  // ── Tool: Revise / Replace Plan ────────────────────────

  pi.registerTool({
    name: "tide_plan_revise",
    label: "Revise Plan",
    description:
      "Revise an existing plan by replacing its title, description, and/or steps. " +
      "Use this instead of tide_plan_create when the user asks to enhance, refine, " +
      "edit, or redo a plan that already exists. Preserves the plan ID, slug, and " +
      "any step summaries/completion status where step titles match.",
    promptSnippet: "Revise an existing plan (preserves ID and completed step state)",
    promptGuidelines: [
      "Use this instead of tide_plan_create when refining an existing plan",
      "Step titles that match existing steps will preserve their completion status and summaries",
    ],
    parameters: Type.Object({
      planId: Type.String({ description: "ID of the plan to revise" }),
      title: Type.Optional(Type.String({ description: "New plan title (omit to keep existing)" })),
      description: Type.Optional(Type.String({ description: "New plan description (omit to keep existing)" })),
      steps: Type.Optional(
        Type.Array(
          Type.Object({
            title: Type.String({ description: "Step title" }),
            description: Type.String({ description: "Detailed description" }),
            files: Type.Optional(Type.Array(Type.String())),
            dependencies: Type.Optional(Type.Array(Type.String())),
            expectedOutcome: Type.Optional(Type.String()),
            assignedModel: Type.Optional(
              Type.Object({
                provider: Type.String(),
                id: Type.String(),
                name: Type.String(),
              }),
            ),
          }),
          { description: "Replacement steps (overwrites existing steps)" },
        ),
      ),
      context: Type.Optional(Type.String({ description: "Updated context/notes" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const plan = loadPlan(ctx.cwd, params.planId);
      if (!plan) {
        return {
          content: [{ type: "text" as const, text: `Plan not found: ${params.planId}` }],
          isError: true,
        };
      }

      if (params.title) plan.title = params.title;
      if (params.description) plan.description = params.description;
      if (params.context !== undefined) plan.context = params.context;

      if (params.steps) {
        // Build a map of existing step summaries/status by title for preservation
        const existingByTitle = new Map<string, PlanStep>();
        for (const s of plan.steps) {
          existingByTitle.set(s.title.toLowerCase(), s);
        }

        plan.steps = params.steps.map((s, i) => {
          const existing = existingByTitle.get(s.title.toLowerCase());
          return {
            id: `step-${i + 1}`,
            title: s.title,
            description: s.description,
            status: existing?.status ?? ("pending" as const),
            files: s.files,
            dependencies: s.dependencies,
            expectedOutcome: s.expectedOutcome,
            assignedModel: s.assignedModel,
            summary: existing?.summary,
            completedAt: existing?.completedAt,
          };
        });
      }

      plan.updatedAt = new Date().toISOString();
      savePlan(ctx.cwd, plan);
      ctx.ui.setStatus("planner", JSON.stringify(plan));

      return {
        content: [
          {
            type: "text" as const,
            text: `Revised plan "${plan.title}" — now has ${plan.steps.length} steps (${plan.id})`,
          },
        ],
        details: { planId: plan.id, slug: plan.slug },
      };
    },
  });

  // ── Tool: List Plans ────────────────────────────────────

  pi.registerTool({
    name: "tide_plan_list",
    label: "List Plans",
    description: "List all plans in the workspace.",
    promptSnippet: "List all plans in the workspace",
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
