use git2::{Repository, StatusOptions};
use serde::Serialize;

#[derive(Serialize)]
pub struct GitStatusInfo {
    pub branch: String,
    pub changed: usize,
    pub staged: usize,
    pub untracked: usize,
}

pub fn get_status(workspace_root: &str) -> Result<GitStatusInfo, String> {
    let repo = Repository::discover(workspace_root).map_err(|e| e.to_string())?;

    // Get branch name
    let branch = match repo.head() {
        Ok(head) => head
            .shorthand()
            .unwrap_or("HEAD")
            .to_string(),
        Err(_) => "no branch".to_string(),
    };

    // Get file statuses
    let mut opts = StatusOptions::new();
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(false);

    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;

    let mut changed = 0;
    let mut staged = 0;
    let mut untracked = 0;

    for entry in statuses.iter() {
        let status = entry.status();
        if status.intersects(
            git2::Status::INDEX_NEW
                | git2::Status::INDEX_MODIFIED
                | git2::Status::INDEX_DELETED
                | git2::Status::INDEX_RENAMED
                | git2::Status::INDEX_TYPECHANGE,
        ) {
            staged += 1;
        }
        if status.intersects(
            git2::Status::WT_MODIFIED
                | git2::Status::WT_DELETED
                | git2::Status::WT_RENAMED
                | git2::Status::WT_TYPECHANGE,
        ) {
            changed += 1;
        }
        if status.intersects(git2::Status::WT_NEW) {
            untracked += 1;
        }
    }

    Ok(GitStatusInfo {
        branch,
        changed,
        staged,
        untracked,
    })
}

#[derive(Serialize)]
pub struct ChangedFile {
    pub path: String,
    pub status: String, // "modified", "added", "deleted", "renamed", "untracked"
}

/// List all changed files with their status (working tree + index).
pub fn list_changed_files(workspace_root: &str) -> Result<Vec<ChangedFile>, String> {
    let repo = Repository::discover(workspace_root).map_err(|e| e.to_string())?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(false);

    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;
    let mut files = Vec::new();

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let st = entry.status();

        let status = if st.intersects(git2::Status::WT_NEW | git2::Status::INDEX_NEW) {
            "added"
        } else if st.intersects(git2::Status::WT_DELETED | git2::Status::INDEX_DELETED) {
            "deleted"
        } else if st.intersects(git2::Status::WT_RENAMED | git2::Status::INDEX_RENAMED) {
            "renamed"
        } else if st.intersects(git2::Status::WT_MODIFIED | git2::Status::INDEX_MODIFIED) {
            "modified"
        } else {
            "untracked"
        };

        files.push(ChangedFile {
            path,
            status: status.to_string(),
        });
    }

    Ok(files)
}
