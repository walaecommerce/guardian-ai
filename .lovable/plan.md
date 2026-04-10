

## Polish QA Checklist

### What's already done
The file has no Slack references, no unused imports, and all 5 existing scenarios read cleanly. Only one change is needed.

### Changes

**File: `src/pages/TestChecklist.tsx`**

1. Add `Bell` back to the lucide-react import (it was removed as "unused" but is now needed for the new scenario)
2. Add a 6th test case to `TEST_CASES` array after the Export scenario:

```
{
  id: 'notification-settings',
  title: 'Notification Settings',
  icon: Bell,
  description: 'Configure notification preferences and verify they persist correctly.',
  steps: [
    { id: 'ns-1', instruction: 'Navigate to Settings → Notifications tab.', expected: 'The Notifications panel loads showing email address, notification triggers, and minimum severity fields.' },
    { id: 'ns-2', instruction: 'Enter or change the email address field.', expected: 'The input accepts a valid email and the Save button becomes active.' },
    { id: 'ns-3', instruction: 'Toggle each notification trigger (Audit Complete, Critical Violations, Score Dropped, Fix Generated).', expected: 'Each toggle switches on/off smoothly. No console errors.' },
    { id: 'ns-4', instruction: 'Change the Minimum Severity dropdown to a different value.', expected: 'Dropdown updates to the selected severity level (Any, Low, Medium, High, Critical).' },
    { id: 'ns-5', instruction: 'Click Save and reload the page, then return to Settings → Notifications.', expected: 'All previously saved values (email, toggles, severity) persist correctly after reload.' },
    { id: 'ns-6', instruction: 'Check the Notification History section.', expected: 'If past notifications exist, they appear in a log list with type, message, and timestamp. If none exist, an empty state message is shown.' },
  ],
}
```

### Files changed
1. `src/pages/TestChecklist.tsx` -- add Bell import, add notification settings test scenario

### Migrations
None.

### Residual risks
None.

