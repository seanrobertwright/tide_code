# TIDE.md — Workspace Configuration
# This file configures safety, test commands, and tool allowlists for Tide.

## Safety
# Approval policy for write operations: always | ask | never
write_approval: always

# Command execution: disabled | always | allowlist
command_policy: disabled

# Git write operations (push, commit, etc.)
git_write: false

## Command Allowlist
# Commands allowed when command_policy is "allowlist" (one per line):
# allowlist: pnpm test
# allowlist: pnpm build

## Test Commands
# Confirmed test commands for this workspace:
# test: pnpm test
