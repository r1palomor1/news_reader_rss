# Tag Editor Enhancement - Known Issue

## Problem
The enhanced Tag Editor (V108.0-108.1) with the following features does not work in Scriptable's WebView:
- Pulse tags integration
- Bulk text area with comma-separated input
- Live preview
- Delete feature
- Save functionality

## Root Cause
JavaScript functions inside the HTML template literal are not executing properly in Scriptable's WebView context. The `${scriptUrl}` variable interpolation inside `<script>` tags causes issues.

## Current Status
**REVERTED to original simple Tag Editor** (pre-V108.0) which works reliably:
- Add one tag at a time
- Manage view to delete tags
- Separate Exclude/Include modes

## Future Consideration
To implement the enhanced Tag Editor, would need to:
1. Use a different approach for JavaScript in WebView
2. Possibly use `evaluateJavaScript()` method instead of inline scripts
3. Or build the UI natively in Scriptable instead of HTML

## Recommendation
Keep the simple Tag Editor for now. It works, even if maintenance is tedious.
The user can manually edit the text files if bulk changes are needed.
