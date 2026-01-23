# Version Control Workflow

## Rule: Commit After Successful Version Testing

After completing and **successfully testing** a version update to `News Reader (RSS).js`, create a git commit.

**Important:** Only commit when the version is working and tested. Do not commit for every small fix or intermediate change.

## Workflow Steps:

### 1. Make Changes
- Update code for new feature or fix
- Update version number in header
- Make multiple edits as needed

### 2. Test Thoroughly
- Run the script in Scriptable
- Test all affected features
- Verify nothing broke
- Confirm new feature works

### 3. Only If Successful - Commit
```bash
# Stage the file
git add "News Reader (RSS).js"

# Commit with descriptive message
git commit -m "V[VERSION] - [Brief description of changes]"
```

**If testing fails:** Fix the issues, don't commit yet. Only commit when everything works.

### 4. Commit Message Format
```
V[VERSION] - [One-line summary of main features/fixes]
```

**Examples:**
- `V111.4 - Stable checkpoint: External Link Handler, Bulk Tag Editor, Smart Quick Edit, Pulse Tags`
- `V112.0 - Added exact pulse tag filtering with green border toggle`
- `V113.0 - Fixed search functionality and improved performance`

### 3. If Something Breaks

**⚠️ CRITICAL: NEVER USE `git checkout` - IT WILL DESTROY UNCOMMITTED CHANGES!**

**SAFE Option A: Revert to previous commit (creates new commit)**
```bash
# Find the commit hash of the working version
git log --oneline

# Revert to that version (creates a new commit, doesn't destroy history)
git revert --no-commit HEAD
git commit -m "Reverted broken V[X] back to working V[Y]"
```

**SAFE Option B: Create a new branch first (safest)**
```bash
# Save current state in a branch
git branch broken-v112

# Reset to last working commit (but keep changes in branch)
git reset --hard HEAD~1

# Now you have both versions saved
```

**SAFE Option C: Manual copy-paste restore**
```bash
# View the working version
git show HEAD~1:"News Reader (RSS).js" > temp-restore.js

# Manually review and copy content back
# This is slower but 100% safe
```

**SAFE Option D: See what changed**
```bash
# Compare current version to last commit
git diff HEAD "News Reader (RSS).js"

# Compare to specific commit
git diff [commit-hash] "News Reader (RSS).js"
```

## ⚠️ DANGER ZONE - NEVER DO THIS ⚠️

```bash
# ❌ NEVER DO THIS - DESTROYS UNCOMMITTED WORK
git checkout "News Reader (RSS).js"

# ❌ NEVER DO THIS - DESTROYS UNCOMMITTED WORK  
git checkout HEAD -- "News Reader (RSS).js"

# ❌ NEVER DO THIS - DESTROYS UNCOMMITTED WORK
git restore "News Reader (RSS).js"
```

**These commands PERMANENTLY DELETE any uncommitted changes!**

## Benefits

✅ **Safety net** - Can always revert to last working version  
✅ **History** - Track what changed in each version  
✅ **Confidence** - Make bold changes knowing you can rollback  
✅ **Documentation** - Commit messages document progress  
✅ **Debugging** - Easy to compare versions and find what broke  
✅ **No data loss** - Using safe revert methods only

## Current Status

✅ Git initialized  
✅ V111.4 committed (first checkpoint)  
✅ Ready for future version commits  
✅ Safe revert workflow documented

## Next Steps

When working on a new version:
1. Make changes (multiple edits OK)
2. Update version number
3. **Test thoroughly** in Scriptable
4. If working: `git add` + `git commit` ✅
5. If broken: Fix issues, test again, then commit
6. Never commit broken/untested code

**Example Flow:**
```
V111.5 work:
- Edit feature A
- Edit feature B  
- Fix bug in A
- Update version to V111.5
- Test in Scriptable → Works! ✅
- git add + git commit "V111.5 - Added feature A and B"

V111.6 work:
- Edit feature C
- Test in Scriptable → Broken! ❌
- Fix the bug
- Test again → Works! ✅
- git add + git commit "V111.6 - Added feature C"
```

---

**This is now our standard workflow for all version updates!**

**REMEMBER: Commit BEFORE trying anything risky. Never use `git checkout` on files!**
