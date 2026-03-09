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
    #[serde(default)]
    dependencies: Vec<String>,
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

/// Default maximum review→fix cycles.
const DEFAULT_MAX_REVIEW_ITERATIONS: usize = 2;

// ── Orchestrator Config ─────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestratorConfig {
    /// "fresh_session" (default) or "compact" — how to handle context for review phase.
    #[serde(default = "default_review_mode")]
    pub review_mode: String,

    /// Max review→fix iterations before completing anyway.
    #[serde(default = "default_max_review_iterations")]
    pub max_review_iterations: usize,

    /// Shell commands to run during review as quality gates (e.g. ["npm run build", "npm test"]).
    #[serde(default)]
    pub qa_commands: Vec<String>,

    /// Seconds to wait for user to answer clarifying questions during orchestration. 0 = no timeout.
    #[serde(default = "default_clarify_timeout")]
    pub clarify_timeout_secs: u64,

    /// Lock the model selected at routing time for the entire orchestration (prevents router re-routing).
    #[serde(default = "default_lock_model")]
    pub lock_model_during_orchestration: bool,
}

fn default_review_mode() -> String { "fresh_session".to_string() }
fn default_max_review_iterations() -> usize { DEFAULT_MAX_REVIEW_ITERATIONS }
fn default_clarify_timeout() -> u64 { 120 }
fn default_lock_model() -> bool { true }

impl Default for OrchestratorConfig {
    fn default() -> Self {
        Self {
            review_mode: default_review_mode(),
            max_review_iterations: default_max_review_iterations(),
            qa_commands: Vec::new(),
            clarify_timeout_secs: default_clarify_timeout(),
            lock_model_during_orchestration: default_lock_model(),
        }
    }
}

impl OrchestratorConfig {
    pub fn load(workspace_root: &str) -> Self {
        let config_path = std::path::PathBuf::from(workspace_root)
            .join(".tide")
            .join("orchestrator-config.json");
        match std::fs::read_to_string(&config_path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }
}

// ── Orchestrator ────────────────────────────────────────────

pub struct Orchestrator {
    workspace_root: String,
    config: OrchestratorConfig,
}

impl Orchestrator {
    pub fn new(workspace_root: String) -> Self {
        let config = OrchestratorConfig::load(&workspace_root);
        Self { workspace_root, config }
    }

    fn check_cancelled(cancel: &std::sync::atomic::AtomicBool) -> Result<(), String> {
        if cancel.load(std::sync::atomic::Ordering::Relaxed) {
            Err("Orchestration cancelled".to_string())
        } else {
            Ok(())
        }
    }

    /// Run the full orchestration pipeline: Route → Plan → Build → Review (loop) → Complete.
    ///
    /// Key design decisions:
    /// - Single session for planning + building (preserves context, enables cache hits)
    /// - Compact between steps instead of creating fresh sessions
    /// - Fresh session only for review (clean perspective for QA)
    /// - Review can loop: findings become fix steps, capped at MAX_REVIEW_ITERATIONS
    pub async fn run(
        &self,
        prompt: String,
        pi_handle: PiHandle,
        app_handle: tauri::AppHandle,
        agent_end_notify: Arc<Notify>,
        cancel: Arc<std::sync::atomic::AtomicBool>,
    ) -> Result<(), String> {
        // Enable auto-compaction so Pi manages context size automatically
        let auto_compact_cmd = serde_json::json!({
            "type": "set_auto_compaction",
            "enabled": true
        });
        pi_handle.send(&auto_compact_cmd).await.ok();

        // ── Phase: Routing ──────────────────────────────────
        Self::check_cancelled(&cancel)?;
        self.emit_phase(&app_handle, OrcPhase::Routing, None, 0, 0, "Classifying task...");

        // ── Phase: Planning ─────────────────────────────────
        Self::check_cancelled(&cancel)?;
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
        // Stay in the same session as planning — the agent already has codebase
        // context from exploration. Compact between steps to manage context size.
        Self::check_cancelled(&cancel)?;
        self.execute_build_steps(&prompt, &plan_id, total, &pi_handle, &app_handle, &agent_end_notify, &cancel).await?;

        // ── Phase: Reviewing (iterative QA loop) ────────────
        // Review mode is configurable: "fresh_session" (default) or "compact".
        // If review finds issues, they become fix steps and we loop.
        let max_iterations = self.config.max_review_iterations;
        let mut review_iteration = 0;
        loop {
            Self::check_cancelled(&cancel)?;
            review_iteration += 1;
            let plan = self.load_plan_by_id(&plan_id)?;
            let current_total = plan.steps.len();

            self.emit_phase(
                &app_handle,
                OrcPhase::Reviewing,
                Some(&plan_id),
                current_total,
                current_total,
                &format!("Reviewing implementation (pass {}/{})", review_iteration, max_iterations),
            );

            // Context strategy for review phase
            if self.config.review_mode == "compact" {
                self.compact(&pi_handle).await;
            } else {
                // Default: fresh session for clean perspective
                self.new_session(&pi_handle).await?;
            }

            let review_prompt = self.build_review_prompt(&prompt, &plan);
            self.send_and_wait(&pi_handle, &review_prompt, &agent_end_notify).await?;

            // Check if review created new fix steps
            let updated_plan = self.load_plan_by_id(&plan_id)?;
            let pending_steps: Vec<&PlanStep> = updated_plan.steps.iter()
                .filter(|s| s.status == "pending")
                .collect();

            if pending_steps.is_empty() || review_iteration >= max_iterations {
                break;
            }

            // Execute the fix steps created by review
            let fix_total = updated_plan.steps.len();
            self.emit_phase(
                &app_handle,
                OrcPhase::Building,
                Some(&plan_id),
                0,
                fix_total,
                &format!("Fixing {} issues from review", pending_steps.len()),
            );

            // New session for fix steps
            Self::check_cancelled(&cancel)?;
            self.new_session(&pi_handle).await?;
            self.execute_pending_steps(&prompt, &plan_id, &pi_handle, &app_handle, &agent_end_notify, &cancel).await?;
        }

        // ── Phase: Complete ─────────────────────────────────
        // Restore auto-compaction to default (off)
        let restore_cmd = serde_json::json!({
            "type": "set_auto_compaction",
            "enabled": false
        });
        pi_handle.send(&restore_cmd).await.ok();

        let final_plan = self.load_plan_by_id(&plan_id)?;
        self.emit_phase(
            &app_handle,
            OrcPhase::Complete,
            Some(&plan_id),
            final_plan.steps.len(),
            final_plan.steps.len(),
            "Orchestration complete!",
        );

        Ok(())
    }

    // ── Build Step Execution ────────────────────────────────

    /// Execute build steps in dependency order.
    /// Steps whose dependencies all completed run next; steps with failed
    /// dependencies are automatically skipped. This respects the `dependencies`
    /// field in the plan schema.
    async fn execute_build_steps(
        &self,
        user_prompt: &str,
        plan_id: &str,
        total: usize,
        pi_handle: &PiHandle,
        app_handle: &tauri::AppHandle,
        notify: &Arc<Notify>,
        cancel: &std::sync::atomic::AtomicBool,
    ) -> Result<(), String> {
        let execution_order = self.resolve_execution_order(plan_id)?;

        for i in execution_order {
            Self::check_cancelled(cancel)?;
            let plan = self.load_plan_by_id(plan_id)?;
            let step = &plan.steps[i];

            // Skip already-completed steps (supports resume)
            if step.status == "completed" || step.status == "skipped" {
                continue;
            }

            // Check if all dependencies are satisfied
            if !step.dependencies.is_empty() {
                let has_failed_dep = step.dependencies.iter().any(|dep_id| {
                    plan.steps.iter().any(|s| s.id == *dep_id && s.status == "failed")
                });
                let has_pending_dep = step.dependencies.iter().any(|dep_id| {
                    plan.steps.iter().any(|s| s.id == *dep_id && s.status != "completed" && s.status != "skipped")
                });

                if has_failed_dep {
                    tracing::warn!("Skipping step '{}' — dependency failed", step.title);
                    self.mark_step_failed(plan_id, &step.id, "dependency failed");
                    self.emit_phase(
                        app_handle, OrcPhase::Building, Some(plan_id), i + 1, total,
                        &format!("Skipping step {}: dependency failed", step.title),
                    );
                    continue;
                }
                if has_pending_dep {
                    // This shouldn't happen with correct topological sort, but guard against it
                    tracing::warn!("Skipping step '{}' — dependency not yet completed", step.title);
                    continue;
                }
            }

            self.emit_phase(
                app_handle,
                OrcPhase::Building,
                Some(plan_id),
                i + 1,
                total,
                &format!("Step {}/{}: {}", i + 1, total, step.title),
            );

            let step_prompt = self.build_step_prompt(user_prompt, &plan, i);

            // Execute step with error recovery
            match self.send_and_wait(pi_handle, &step_prompt, notify).await {
                Ok(()) => {}
                Err(e) => {
                    let error_msg = format!("Step {}/{} '{}' failed: {}", i + 1, total, step.title, e);
                    tracing::error!("{}", error_msg);

                    // Mark step as failed in the plan
                    self.mark_step_failed(plan_id, &step.id, &e);

                    self.emit_phase(
                        app_handle,
                        OrcPhase::Building,
                        Some(plan_id),
                        i + 1,
                        total,
                        &error_msg,
                    );

                    // Continue to next step rather than aborting the entire pipeline
                    continue;
                }
            }
        }
        Ok(())
    }

    /// Resolve execution order via topological sort of step dependencies.
    /// Falls back to natural order if no dependencies are specified.
    fn resolve_execution_order(&self, plan_id: &str) -> Result<Vec<usize>, String> {
        let plan = self.load_plan_by_id(plan_id)?;
        let n = plan.steps.len();

        // Check if any step has dependencies
        let has_deps = plan.steps.iter().any(|s| !s.dependencies.is_empty());
        if !has_deps {
            return Ok((0..n).collect());
        }

        // Build adjacency list and in-degree count for Kahn's algorithm
        let id_to_idx: std::collections::HashMap<&str, usize> = plan.steps
            .iter()
            .enumerate()
            .map(|(i, s)| (s.id.as_str(), i))
            .collect();

        let mut in_degree = vec![0usize; n];
        let mut adj: Vec<Vec<usize>> = vec![vec![]; n];

        for (i, step) in plan.steps.iter().enumerate() {
            for dep_id in &step.dependencies {
                if let Some(&dep_idx) = id_to_idx.get(dep_id.as_str()) {
                    adj[dep_idx].push(i);
                    in_degree[i] += 1;
                }
            }
        }

        // Kahn's topological sort
        let mut queue: std::collections::VecDeque<usize> = in_degree
            .iter()
            .enumerate()
            .filter(|(_, &deg)| deg == 0)
            .map(|(i, _)| i)
            .collect();

        let mut order = Vec::with_capacity(n);
        while let Some(node) = queue.pop_front() {
            order.push(node);
            for &next in &adj[node] {
                in_degree[next] -= 1;
                if in_degree[next] == 0 {
                    queue.push_back(next);
                }
            }
        }

        // If we couldn't sort all nodes, there's a cycle — fall back to natural order
        if order.len() != n {
            tracing::warn!("Dependency cycle detected in plan steps, falling back to natural order");
            return Ok((0..n).collect());
        }

        Ok(order)
    }

    /// Execute only pending steps (used for fix steps created by review).
    async fn execute_pending_steps(
        &self,
        user_prompt: &str,
        plan_id: &str,
        pi_handle: &PiHandle,
        app_handle: &tauri::AppHandle,
        notify: &Arc<Notify>,
        cancel: &std::sync::atomic::AtomicBool,
    ) -> Result<(), String> {
        let plan = self.load_plan_by_id(plan_id)?;
        let total = plan.steps.len();
        let pending_indices: Vec<usize> = plan.steps.iter()
            .enumerate()
            .filter(|(_, s)| s.status == "pending")
            .map(|(i, _)| i)
            .collect();

        for (exec_num, &i) in pending_indices.iter().enumerate() {
            Self::check_cancelled(cancel)?;
            let plan = self.load_plan_by_id(plan_id)?;
            let step = &plan.steps[i];

            self.emit_phase(
                app_handle,
                OrcPhase::Building,
                Some(plan_id),
                i + 1,
                total,
                &format!("Fix {}/{}: {}", exec_num + 1, pending_indices.len(), step.title),
            );

            let step_prompt = self.build_step_prompt(user_prompt, &plan, i);
            match self.send_and_wait(pi_handle, &step_prompt, notify).await {
                Ok(()) => {}
                Err(e) => {
                    tracing::error!("Fix step '{}' failed: {}", step.title, e);
                    self.mark_step_failed(plan_id, &step.id, &e);
                    continue;
                }
            }
        }
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
        let mut cmd = serde_json::json!({
            "type": "prompt",
            "message": prompt,
        });

        // Send with request ID for response correlation
        let response_rx = pi_handle
            .send_with_id(&mut cmd)
            .await
            .map_err(|e| format!("Failed to send prompt: {}", e))?;

        // Wait for the immediate response (confirms prompt was accepted)
        let response = response_rx
            .await
            .map_err(|_| "Pi response channel dropped".to_string())?;

        let success = response
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if !success {
            let error = response
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown error");
            return Err(format!("Prompt rejected: {}", error));
        }

        // Wait for agent to finish processing (agent_end event)
        notify.notified().await;
        Ok(())
    }

    /// Request Pi to compact the current session context.
    /// Waits for Pi's response to ensure compaction completes before continuing.
    async fn compact(&self, pi_handle: &PiHandle) {
        let mut cmd = serde_json::json!({ "type": "compact" });
        match pi_handle.send_with_id(&mut cmd).await {
            Ok(rx) => {
                match tokio::time::timeout(
                    tokio::time::Duration::from_secs(30),
                    rx,
                )
                .await
                {
                    Ok(Ok(response)) => {
                        tracing::debug!(
                            "Compact completed: {}",
                            response
                                .get("success")
                                .and_then(|v| v.as_bool())
                                .map(|b| b.to_string())
                                .unwrap_or_else(|| "unknown".to_string())
                        );
                    }
                    Ok(Err(_)) => tracing::warn!("Compact response channel dropped"),
                    Err(_) => tracing::warn!("Compact timed out after 30s"),
                }
            }
            Err(e) => tracing::warn!("Failed to send compact command: {}", e),
        }
    }

    /// Create a new session in Pi. Waits for Pi's response and checks if it was cancelled.
    async fn new_session(&self, pi_handle: &PiHandle) -> Result<(), String> {
        let mut cmd = serde_json::json!({ "type": "new_session" });
        let rx = pi_handle
            .send_with_id(&mut cmd)
            .await
            .map_err(|e| format!("Failed to create new session: {}", e))?;

        let response = tokio::time::timeout(
            tokio::time::Duration::from_secs(10),
            rx,
        )
        .await
        .map_err(|_| "new_session timed out after 10s".to_string())?
        .map_err(|_| "new_session response channel dropped".to_string())?;

        let cancelled = response
            .get("data")
            .and_then(|d| d.get("cancelled"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if cancelled {
            return Err("new_session was cancelled by an extension".to_string());
        }

        Ok(())
    }

    /// Mark a step as failed in the plan JSON on disk.
    fn mark_step_failed(&self, plan_id: &str, step_id: &str, error: &str) {
        if let Ok(mut plan) = self.load_plan_by_id(plan_id) {
            if let Some(step) = plan.steps.iter_mut().find(|s| s.id == step_id) {
                step.status = "failed".to_string();
                step.summary = Some(format!("Failed: {}", error));
            }
            self.save_plan(&plan);
        }
    }

    fn plans_dir(&self) -> std::path::PathBuf {
        std::path::PathBuf::from(&self.workspace_root)
            .join(".tide")
            .join("plans")
    }

    fn save_plan(&self, plan: &Plan) {
        let dir = self.plans_dir();
        if !dir.exists() {
            let _ = std::fs::create_dir_all(&dir);
        }
        // Find the plan file by scanning for matching ID
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(existing) = serde_json::from_str::<Plan>(&content) {
                        if existing.id == plan.id {
                            let _ = std::fs::write(&path, serde_json::to_string_pretty(plan).unwrap_or_default());
                            return;
                        }
                    }
                }
            }
        }
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

    /// Returns the orchestration marker prefix if model locking is enabled.
    fn orc_marker(&self) -> &str {
        if self.config.lock_model_during_orchestration {
            "[tide:orchestrated]\n"
        } else {
            ""
        }
    }

    // ── Prompt Builders ─────────────────────────────────────

    fn build_planning_prompt(&self, user_prompt: &str) -> String {
        // Check if research cache exists from a previous planning session
        let research_path = std::path::PathBuf::from(&self.workspace_root)
            .join(".tide")
            .join("research.md");
        let research_context = if research_path.exists() {
            match std::fs::read_to_string(&research_path) {
                Ok(content) if !content.trim().is_empty() => {
                    format!(
                        "## Cached Research\n\n\
                         Previous exploration findings (may be stale — verify key assumptions):\n\n\
                         {}\n\n",
                        content.chars().take(4000).collect::<String>()
                    )
                }
                _ => String::new(),
            }
        } else {
            String::new()
        };

        let clarify_instruction = if self.config.clarify_timeout_secs > 0 {
            format!(
                "2. Ask clarifying questions using `tide_plan_clarify` if there are ambiguities \
                 (user has {}s to respond before auto-skip)\n",
                self.config.clarify_timeout_secs
            )
        } else {
            "2. Ask clarifying questions using `tide_plan_clarify` if there are ambiguities\n".to_string()
        };

        let marker = self.orc_marker();
        format!(
            "{marker}\
             You are in PLANNING MODE. Do NOT implement anything yet.\n\n\
             Follow these steps:\n\
             1. Explore the codebase to understand the current architecture\n\
             {clarify_instruction}\
             3. Create a detailed implementation plan using `tide_plan_create`\n\
             4. Write a research summary to `.tide/research.md` capturing:\n\
                - Key file paths and their roles\n\
                - Existing patterns and conventions found\n\
                - Architecture decisions relevant to this task\n\
                - Any gotchas or constraints discovered\n\
                This cache helps future build steps avoid re-exploring the codebase.\n\n\
             {research_context}\
             ## Original Request\n\n\
             {user_prompt}\n\n\
             IMPORTANT: Only explore, plan, and write research.md. Do NOT implement any code changes.",
            clarify_instruction = clarify_instruction,
            research_context = research_context,
            user_prompt = user_prompt,
        )
    }

    fn build_step_prompt(&self, user_prompt: &str, plan: &Plan, step_index: usize) -> String {
        let step = &plan.steps[step_index];
        let total = plan.steps.len();

        // Load research cache if available (written during planning phase)
        let research_path = std::path::PathBuf::from(&self.workspace_root)
            .join(".tide")
            .join("research.md");
        let research_section = if research_path.exists() {
            match std::fs::read_to_string(&research_path) {
                Ok(content) if !content.trim().is_empty() => {
                    format!(
                        "## Codebase Research\n\n{}\n\n",
                        content.chars().take(3000).collect::<String>()
                    )
                }
                _ => String::new(),
            }
        } else {
            String::new()
        };

        // Build completed steps summaries (lightweight context from prior steps)
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

        // Build remaining steps as a brief outline (not full JSON)
        let remaining_summaries: Vec<String> = plan
            .steps
            .iter()
            .enumerate()
            .filter(|(i, s)| *i > step_index && s.status == "pending")
            .map(|(i, s)| format!("- Step {}: {}", i + 1, s.title))
            .collect();

        let remaining_section = if remaining_summaries.is_empty() {
            String::new()
        } else {
            format!(
                "## Remaining Steps\n\n{}\n\n",
                remaining_summaries.join("\n")
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

        let marker = self.orc_marker();
        format!(
            "{marker}\
             You are executing step {step_num}/{total} of an implementation plan.\n\n\
             ## Original Task\n\n\
             {user_prompt}\n\n\
             {research_section}\
             {completed_section}\
             ## Current Step: {step_title}\n\n\
             {step_desc}\n\
             {files_section}\
             {outcome_section}\n\
             {remaining_section}\
             Execute ONLY this step. When done:\n\
             1. Call `tide_plan_update` with planId=\"{plan_id}\", stepId=\"{step_id}\", status=\"completed\"\n\
             2. Call `tide_plan_step_summary` with a concise summary of what you did",
            step_num = step_index + 1,
            total = total,
            user_prompt = user_prompt,
            research_section = research_section,
            completed_section = completed_section,
            step_title = step.title,
            step_desc = step.description,
            files_section = files_section,
            outcome_section = outcome_section,
            remaining_section = remaining_section,
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

        // Collect all files referenced across steps for the reviewer
        let all_files: Vec<&str> = plan
            .steps
            .iter()
            .flat_map(|s| s.files.iter().map(|f| f.as_str()))
            .collect::<std::collections::HashSet<&str>>()
            .into_iter()
            .collect();

        let files_section = if all_files.is_empty() {
            String::new()
        } else {
            format!(
                "## Modified Files\n\n\
                 Read these files to verify the implementation:\n{}\n\n",
                all_files.iter().map(|f| format!("- `{}`", f)).collect::<Vec<_>>().join("\n")
            )
        };

        // Build QA commands section if configured
        let qa_section = if self.config.qa_commands.is_empty() {
            "4. Run build/test commands if available (check TIDE.md for test commands)\n".to_string()
        } else {
            let cmds = self.config.qa_commands.iter()
                .map(|c| format!("   - `{}`", c))
                .collect::<Vec<_>>()
                .join("\n");
            format!(
                "4. **MANDATORY**: Run these QA commands and report their output:\n{}\n\
                 If any command fails, you MUST create fix steps to address the failures.\n",
                cmds
            )
        };

        let marker = self.orc_marker();
        format!(
            "{marker}\
             You are reviewing a completed implementation.\n\n\
             ## Original Task\n\n\
             {user_prompt}\n\n\
             ## Plan: {plan_title}\n\n\
             {plan_desc}\n\n\
             ## Step Summaries\n\n\
             {step_summaries}\n\n\
             {files_section}\
             ## Review Instructions\n\n\
             1. Read the modified files listed above to verify the implementation\n\
             2. Check for consistency issues between steps\n\
             3. Look for missing imports, broken references, or integration gaps\n\
             {qa_section}\
             5. If you find issues that need fixing:\n\
                - Call `tide_plan_revise` to add new fix steps to the plan (append them after existing steps)\n\
                - Set their status to \"pending\" so they get executed\n\
             6. If everything looks correct, confirm the implementation is complete",
            user_prompt = user_prompt,
            plan_title = plan.title,
            plan_desc = plan.description,
            step_summaries = step_summaries.join("\n"),
            files_section = files_section,
            qa_section = qa_section,
        )
    }
}
