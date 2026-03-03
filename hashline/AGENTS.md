# hashline Plugin

This plugin provides hash-based file editing for safer, more efficient file operations.

## When to Use Hashline

When `.hashline/` exists in the project root, **always use hashline commands** instead of native Read/Edit/Write/Grep tools.

## Quick Reference

```bash
# Read a file
bash .hashline/hashline_cat.sh <path> [offset] [limit]

# Search in file or directory
bash .hashline/hashline_grep.sh <pattern> <file|dir>

# Discover files
bash .hashline/hashline_find.sh <dir> [glob]

# Edit a file (atomic, anchor-validated)
bash .hashline/hashline_edit.sh <path> <<'EDITS'
set_line 5:a3
new content
---
replace_lines 10:b2 15:c7
replacement block
---
insert_after 20:d4
new lines here
---
delete_lines 25:e5 30:f6
---
EDITS
```

## Output Format

All read operations return: `LINE:HASH|content`

Use returned `LINE:HASH` values as anchors for subsequent edits — no need to re-read the file.

## Rules

1. All anchors reference **pre-edit** line state
2. Batch edits are **all-or-nothing** (one bad anchor rejects all)
3. No-op edits (unchanged content) are rejected
4. Duplicate `insert_after` on same line is rejected
5. `replace_lines`/`delete_lines` start must be ≤ end

## ERE Special Characters

Escape in grep patterns: `\(` `\)` `\[` `\]` `\.` `\*` `\+` `\?`

## Setup

Run `/hashline-install` in any project to enable hashline for that project.
