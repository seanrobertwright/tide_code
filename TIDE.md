# TIDE.md — Workspace Safety Config
# This file is read by tide-safety.ts on each Pi session start.

## Safety Policy

write_approval: always        # Write/edit tools always need approval
command_approval: always      # Bash/command execution requires approval

## Command Allowlist
# Commands listed here are allowed when command policy is set to "allowlist".
# Format: one command per line
command_allowlist:

## Test Commands
# Confirmed test commands for this workspace (written by test discovery skill).
# Format: one command per line
test_commands:
