<!-- All models will receive this prompt with file path specified accordingly, always in new chat, these comments excluded, State Diagram Agent selected, models on default settings -->

Refactor the currently opened React component to reduce implementation complexity while preserving runtime behavior.

Focus on:
- simplifying the implementation where reasonably possible
- simplifying the state/mutator flow

Do NOT modify the original file.
Create the refactored copy exactly at this path with following naming convention:
experiments\refactoring\data\Code\<OriginalFileName>.gpt53cdx.refactor.jsx/tsx

Keep exports and imports valid so the new file can compile independently.

After creating the file, briefly summarize:
- the main refactoring changes
- why runtime behavior should be preserved

Use #stateDiagram to get context.

<!-- ^ Use #stateDiagram is there when testing CodeAndDiagram to make sure that the model calls the tool (otherwise it is disabled in the Agent and can be omitted...) -->