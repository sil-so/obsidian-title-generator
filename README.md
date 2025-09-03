# Title Generator

Quickly and easily title your [Obsidian](https://obsidian.md) notes using OpenAI or Fireworks AI.

Generate titles for one or multiple notes at a time based on their content.

Generating a title will set the note's title directly. Run multiple times for variations.

## Three ways to use

### Command Palette

If a note is active in either editing or reading mode, there will be an entry in the command palette: `Title Generator: Generate title`

![Command palette](img/command-palette.png)

### Editor Menu

If a note is active in either editing or reading mode, there will be an entry in the editor dropdown menu: `Generate title`

![Editor menu](img/editor-menu.png)

### File Menu

If you right click on a file name in the file menu there will be an entry in the contextual menu: `Generate title`.

With multiple files selected, right click on a file name and there will be an entry in the contextual menu: `Generate titles`

![File menu](img/file-menu.png)

## Settings

- Provider: Choose OpenAI or Fireworks AI.
- OpenAI: API key and model (e.g. `gpt-5-nano-2025-08-07`).
- Fireworks AI: API key and model (e.g., `accounts/fireworks/models/llama-v3p3-70b-instruct`).
  - Fireworks calls use the Responses API with `store=false` by default so data isn’t retained. See Fireworks docs for “Create a model response” and the Responses API guide.
- Custom prompt: Enter any prompt you like. Use `{{content}}` where the note text should be inserted.
- Prompt presets: Pick a preset and click “Use preset” to load it into your custom prompt, then tweak as desired.

### Prompt placeholder

Use `{{content}}` in your custom prompt; the plugin will insert the note’s text there.

Example minimal prompt:

Write a concise Title Case note title based on the content below.
No quotes, no trailing punctuation.

Content:
{{content}}

Return only the title.
