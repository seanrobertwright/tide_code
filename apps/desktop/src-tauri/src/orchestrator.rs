use crate::ipc::PiHandle;
use serde::{Deserialize, Serialize};

use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Notify;

// ── Types ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum OrcPhase {
    Idle,
    Routing,
    Planning,
    Building,
    Reviewing,
    Complete,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrcEvent {
    pub phase: OrcPhase,
    pub plan_id: Option<String>,
    pub current_step: usize,
    pub total_steps: usize,
    pub message: String,
}

#[derive(Debug, Deserialize, serde::Serialize)]
struct PlanStep {
    id: String,
    title: String,
    description: String,
    status: String,
    #[serde(default)]
    files: Vec<String>,
    #[serde(default, rename = "expectedOutcome")]
    expected_outcome: Option<String>,
    #[serde(default)]
    summary: Option<String>,
}

#[derive(Debug, Deserialize, serde::Serialize)]
struct Plan {
    id: String,
    title: String,
    description: String,
    status: String,
    steps: Vec<PlanStep>,
}

// ── Orchestrator ────────────────────────────────────────────

pub struct Orchestrator {
    workspace_root: String,
}

impl Orchestrator {
    pub fn new(workspace_root: String) -> Self {
        Self { workspace_root }
    }

    /// Run the full orchestration pipeline: Route → Plan → Build → Review → Complete.
    pub async fn run(
        &self,
        prompt: String,
        pi_handle: PiHandle,
        app_handle: tauri::AppHandle,
        agent_end_notify: Arc<Notify>,
    ) -> Result<(), String> {
        // ── Phase: Routing ──────────────────────────────────
        // Routing is handled automatically by the tide-router Pi extension
        // on the first prompt. We just emit the phase event.
        self.emit_phase(&app_handle, OrcPhase::Routing, None, 0, 0, "Classifying task...");

        // ── Phase: Planning ─────────────────────────────────
        self.emit_phase(&app_handle, OrcPhase::Planning, None, 0, 0, "Creating implementation plan...");

        let planning_prompt = self.build_planning_prompt(&prompt);
        self.send_and_wait(&pi_handle, &planning_prompt, &agent_end_notify).await?;

        // Read the plan that was just created from disk
        let plan = self.load_latest_plan()?;
        let plan_id = plan.id.clone();
        let total = plan.steps.len();

        if total == 0 {
            return Err("Plan has no steps".to_string());
        }

        // ── Phase: Building ─────────────────────────────────
        for i in 0..total {
            // Re-read plan from disk each iteration (steps may have been updated)
            let plan = self.load_plan_by_id(&plan_id)?;
            let step = &plan.steps[i];

            self.emit_phase(
                &app_handle,
                OrcPhase::Building,
                Some(&plan_id),
                i + 1,
                total,
                &format!("Step {}/{}: {}", i + 1, total, step.title),
            );

            // Fresh session for each step
            self.new_session(&pi_handle, &agent_end_notify).await?;

            // Build the step prompt with full context
            let step_prompt = self.build_step_prompt(&prompt, &plan, i);
            self.send_and_wait(&pi_handle, &step_prompt, &agent_end_notify).await?;
        }

        // ── Phase: Reviewing ────────────────────────────────
        self.emit_phase(
            &app_handle,
            OrcPhase::Reviewing,
            Some(&plan_id),
            total,
            total,
            "Reviewing implementation...",
        );

        // Fresh session for review
        self.new_session(&pi_handle, &agent_end_notify).await?;

        let plan = self.load_plan_by_id(&plan_id)?;
        let review_prompt = self.build_review_prompt(&prompt, &plan);
        self.send_and_wait(&pi_handle, &review_prompt, &agent_end_notify).await?;

        // ── Phase: Complete ─────────────────────────────────
        self.emit_phase(
            &app_handle,
            OrcPhase::Complete,
            Some(&plan_id),
            total,
            total,
            "Orchestration complete!",
        );

        Ok(())
    }

    // ── Helpers ─────────────────────────────────────────────

    fn emit_phase(
        &self,
        handle: &tauri::AppHandle,
        phase: OrcPhase,
        plan_id: Option<&str>,
        current_step: usize,
        total_steps: usize,
        message: &str,
    ) {
        let event = OrcEvent {
            phase,
            plan_id: plan_id.map(String::from),
            current_step,
            total_steps,
            message: message.to_string(),
        };
        let _ = handle.emit("orchestration_event", &event);
    }

    async fn send_and_wait(
        &self,
        pi_handle: &PiHandle,
        prompt: &str,
        notify: &Arc<Notify>,
    ) -> Result<(), String> {
        let cmd = serde_json::json!({
            "type": "prompt",
            "message": prompt,
        });
        pi_handle
            .send(&cmd)
            .await
            .map_err(|e| format!("Failed to send prompt: {}", e))?;

        // Wait for the agent to finish processing
        notify.notified().await;
        Ok(())
    }

    async fn new_session(
        &self,
        pi_handle: &PiHandle,
        notify: &Arc<Notify>,
    ) -> Result<(), String> {
        let cmd = serde_json::json!({ "type": "new_session" });
        pi_handle
            .send(&cmd)
            .await
            .map_err(|e| format!("Failed to create new session: {}", e))?;

        // Wait briefly for the session to initialize
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        // Consume any pending notification from session creation
        let _ = tokio::time::timeout(
            tokio::time::Duration::from_millis(100),
            notify.notified(),
        )
        .await;
        Ok(())
    }

    fn plans_dir(&self) -> std::path::PathBuf {
        std::path::PathBuf::from(&self.workspace_root)
            .join(".tide")
            .join("plans")
    }

    fn load_latest_plan(&self) -> Result<Plan, String> {
        let dir = self.plans_dir();
        if !dir.exists() {
            return Err("No .tide/plans/ directory found".to_string());
        }

        let mut plans: Vec<(Plan, std::time::SystemTime)> = Vec::new();
        let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(plan) = serde_json::from_str::<Plan>(&content) {
                    let mtime = entry
                        .metadata()
                        .and_then(|m| m.modified())
                        .unwrap_or(std::time::UNIX_EPOCH);
                    plans.push((plan, mtime));
                }
            }
        }

        plans.sort_by(|a, b| b.1.cmp(&a.1));
        plans
            .into_iter()
            .next()
            .map(|(p, _)| p)
            .ok_or_else(|| "No plans found in .tide/plans/".to_string())
    }

    fn load_plan_by_id(&self, plan_id: &str) -> Result<Plan, String> {
        let dir = self.plans_dir();
        let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(plan) = serde_json::from_str::<Plan>(&content) {
                    if plan.id == plan_id {
                        return Ok(plan);
                    }
                }
            }
        }

        Err(format!("Plan not found: {}", plan_id))
    }

    // ── Prompt Builders ─────────────────────────────────────

    fn build_planning_prompt(&self, user_prompt: &str) -> String {
        format!(
            "You are in PLANNING MODE. Do NOT implement anything yet.\n\n\
             Follow these steps:\n\
             1. Explore the codebase to understand the current architecture\n\
             2. Ask clarifying questions using `tide_plan_clarify` if there are ambiguities\n\
             3. Create a detailed implementation plan using `tide_plan_create`\n\n\
             ## Original Request\n\n\
             {}\n\n\
             IMPORTANT: Only explore and plan. Do NOT write or edit any code files.",
            user_prompt
        )
    }

    fn build_step_prompt(&self, user_prompt: &str, plan: &Plan, step_index: usize) -> String {
        let step = &plan.steps[step_index];
        let total = plan.steps.len();

        // Build completed steps summaries
        let completed_summaries: Vec<String> = plan
            .steps
            .iter()
            .filter(|s| s.status == "completed" && s.summary.is_some())
            .map(|s| format!("- **{}**: {}", s.title, s.summary.as_deref().unwrap_or("")))
            .collect();

        let completed_section = if completed_summaries.is_empty() {
            String::new()
        } else {
            format!(
                "## Completed Steps\n\n{}\n\n",
                completed_summaries.join("\n")
            )
        };

        let files_section = if step.files.is_empty() {
            String::new()
        } else {
            format!("Target files: {}\n", step.files.join(", "))
        };

        let outcome_section = match &step.expected_outcome {
            Some(outcome) => format!("Expected outcome: {}\n", outcome),
            None => String::new(),
        };

        let plan_json =
            serde_json::to_string_pretty(plan).unwrap_or_else(|_| "{}".to_string());

        format!(
            "You are executing step {step_num}/{total} of an implementation plan.\n\n\
             ## Original Task\n\n\
             {user_prompt}\n\n\
             ## Full Plan\n\n\
             ```json\n{plan_json}\n```\n\n\
             {completed_section}\
             ## Current Step: {step_title}\n\n\
             {step_desc}\n\
             {files_section}\
             {outcome_section}\n\
             Execute ONLY this step. When done:\n\
             1. Call `tide_plan_update` with planId=\"{plan_id}\", stepId=\"{step_id}\", status=\"completed\"\n\
             2. Call `tide_plan_step_summary` with a concise summary of what you did",
            step_num = step_index + 1,
            total = total,
            user_prompt = user_prompt,
            plan_json = plan_json,
            completed_section = completed_section,
            step_title = step.title,
            step_desc = step.description,
            files_section = files_section,
            outcome_section = outcome_section,
            plan_id = plan.id,
            step_id = step.id,
        )
    }

    fn build_review_prompt(&self, user_prompt: &str, plan: &Plan) -> String {
        let step_summaries: Vec<String> = plan
            .steps
            .iter()
            .map(|s| {
                let summary = s.summary.as_deref().unwrap_or("(no summary)");
                format!("- **{}** [{}]: {}", s.title, s.status, summary)
            })
            .collect();

        format!(
            "You are reviewing a completed implementation.\n\n\
             ## Original Task\n\n\
             {}\n\n\
             ## Plan: {}\n\n\
             {}\n\n\
             ## Step Summaries\n\n\
             {}\n\n\
             ## Review Checklist\n\n\
             1. Verify all plan steps were addressed\n\
             2. Check for consistency issues between steps\n\
             3. Look for any missing imports, broken references, or integration gaps\n\
             4. Run build/test commands if available\n\
             5. Report any problems found or confirm the implementation looks correct",
            user_prompt,
            plan.title,
            plan.description,
            step_summaries.join("\n"),
        )
    }
}
