import {
  App,
  Editor,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
  TextAreaComponent,
} from 'obsidian';
import OpenAI from 'openai';
import pMap from 'p-map';
import path from 'path-browserify';

type Provider = 'openai' | 'fireworks';

interface TitleGeneratorSettings {
  // Provider selection
  provider: Provider;

  // OpenAI
  openAiApiKey: string;
  openAiModel: string;

  // Fireworks
  fireworksApiKey: string;
  fireworksModel: string;

  // Prompt
  customPrompt: string;
}

const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1';

// Helpful, concise presets you can load into the Custom Prompt field
const PROMPT_PRESETS: Record<
  string,
  { label: string; prompt: string }
> = {
  kebab: {
    label: 'Kebab-case slug (<=6 words, lowercase, filename-safe)',
    prompt:
      'You are naming a note. Based on the note content below, produce a short, descriptive kebab-case slug for the filename.\nRules:\n- 3 to 6 words\n- lowercase letters and digits only\n- words separated by dashes\n- no quotes, no trailing punctuation, no emojis\n- remove or rewrite anything unsafe for filenames\n\nContent:\n{{content}}\n\nOnly return the slug.',
  },
  titlecase: {
    label: 'Human-friendly Title Case (concise, ~6 words)',
    prompt:
      'Write a concise, human-friendly Title Case note title based on the content below.\nRules:\n- ~4–8 words\n- No trailing punctuation\n- No quotes or emojis\n- Keep it descriptive but compact\n\nContent:\n{{content}}\n\nReturn only the title.',
  },
  camel: {
    label: 'CamelCase (project-style identifier)',
    prompt:
      'Create a concise CamelCase identifier that could serve as a project-style note title.\nRules:\n- 2–5 words combined into CamelCase\n- No spaces, punctuation, or emojis\n- Keep it descriptive and readable\n\nContent:\n{{content}}\n\nReturn only the CamelCase identifier.',
  },
  spacesLower: {
    label: 'Space-separated, lowercase (<=60 chars)',
    prompt:
      'Create a space-separated, lowercase title based on the content below.\nRules:\n- Max 60 characters total\n- No trailing punctuation, quotes, or emojis\n- Be descriptive yet compact\n\nContent:\n{{content}}\n\nReturn only the title.',
  },
  ticket: {
    label: 'JIRA-style summary (<=8 words, no punctuation)',
    prompt:
      'Write a crisp, JIRA-style summary title.\nRules:\n- <= 8 words\n- No trailing punctuation\n- No quotes or emojis\n- Action- or topic-focused\n\nContent:\n{{content}}\n\nReturn only the title.',
  },
};

const DEFAULT_PROMPT =
  'Write a concise, descriptive Title Case note title based on the content below.\nRules:\n- Aim for 4–8 words\n- No quotes or trailing punctuation\n- No emojis\n- Keep it filename-safe\n\nContent:\n{{content}}\n\nReturn only the title.';

const DEFAULT_SETTINGS: TitleGeneratorSettings = {
  provider: 'openai',
  openAiApiKey: '',
  openAiModel: 'gpt-5-nano-2025-08-07',
  fireworksApiKey: '',
  fireworksModel: '',
  customPrompt: DEFAULT_PROMPT,
};

function useCompletionsEndpoint(model: string): boolean {
  // Heuristic: classic/instruct/text models use the Completions endpoint.
  // Chat models (gpt-3.5/4/4o/etc.) use the Chat Completions endpoint.
  if (!model) return false;
  const lower = model.toLowerCase();
  return (
    lower.includes('instruct') ||
    lower.startsWith('text-') ||
    lower.includes('davinci') ||
    lower.includes('curie') ||
    lower.includes('babbage') ||
    lower.includes('ada')
  );
}

function stripSurroundingQuotes(s: string): string {
  return s.replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '');
}

function removeInvalidFileNameChars(s: string): string {
  // Replace characters not allowed by common OS file systems
  // Windows reserved: < > : " / \ | ? *
  return s.replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim();
}

class TitleGeneratorSettingTab extends PluginSettingTab {
  plugin: TitleGeneratorPlugin;

  private presetKey: string = 'kebab';

  constructor(app: App, plugin: TitleGeneratorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Provider selector
    new Setting(containerEl)
      .setName('Provider')
      .setDesc('Choose which API to use.')
      .addDropdown((dd) => {
        dd.addOption('openai', 'OpenAI');
        dd.addOption('fireworks', 'Fireworks AI');
        dd.setValue(this.plugin.settings.provider);
        dd.onChange(async (val: Provider) => {
          this.plugin.settings.provider = val;
          await this.plugin.saveSettings();
          this.display(); // re-render provider-specific fields
        });
      });

    // OpenAI settings (visible only if provider is OpenAI)
    if (this.plugin.settings.provider === 'openai') {
      new Setting(containerEl).setName('OpenAI API key').addText((text) => {
        text.inputEl.type = 'password';
        text.inputEl.style.width = '100%';
        text
          .setPlaceholder('API Key')
          .setValue(this.plugin.settings.openAiApiKey)
          .onChange(async (newValue) => {
            this.plugin.settings.openAiApiKey = newValue.trim();
            await this.plugin.saveSettings();
          });
      });

      new Setting(containerEl)
        .setName('OpenAI model')
        .setDesc('Examples: gpt-4o-mini, gpt-4o, gpt-3.5-turbo, gpt-3.5-turbo-instruct')
        .addText((text) => {
          text.inputEl.style.width = '100%';
          text
            .setPlaceholder('gpt-4o-mini')
            .setValue(this.plugin.settings.openAiModel)
            .onChange(async (newValue) => {
              this.plugin.settings.openAiModel = newValue.trim();
              await this.plugin.saveSettings();
            });
        });
    }

    // Fireworks settings (visible only if provider is Fireworks)
    if (this.plugin.settings.provider === 'fireworks') {
      new Setting(containerEl)
        .setName('Fireworks API key')
        .addText((text) => {
          text.inputEl.type = 'password';
          text.inputEl.style.width = '100%';
          text
            .setPlaceholder('API Key')
            .setValue(this.plugin.settings.fireworksApiKey)
            .onChange(async (newValue) => {
              this.plugin.settings.fireworksApiKey = newValue.trim();
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName('Fireworks model')
        .setDesc(
          'Enter a Fireworks model ID (e.g., accounts/fireworks/models/llama-v3p1-8b-instruct).'
        )
        .addText((text) => {
          text.inputEl.style.width = '100%';
          text
            .setPlaceholder('accounts/fireworks/models/llama-v3p1-8b-instruct')
            .setValue(this.plugin.settings.fireworksModel)
            .onChange(async (newValue) => {
              this.plugin.settings.fireworksModel = newValue.trim();
              await this.plugin.saveSettings();
            });
        });

      const note = containerEl.createEl('p');
      note.style.opacity = '0.8';
      note.textContent =
        'Fireworks calls use the Responses API with store=false by default for no retention.';
    }

    // Prompt presets and custom prompt
    let promptAreaRef: TextAreaComponent | null = null;

    new Setting(containerEl)
      .setName('Prompt presets')
      .setDesc(
        'Pick a preset and click “Use preset” to copy it into your Custom prompt field, then tweak as you like.'
      )
      .addDropdown((dd) => {
        Object.entries(PROMPT_PRESETS).forEach(([k, v]) => {
          dd.addOption(k, v.label);
        });
        dd.setValue(this.presetKey);
        dd.onChange((val) => {
          this.presetKey = val;
        });
      })
      .addButton((btn) => {
        btn.setButtonText('Use preset').onClick(async () => {
          const preset = PROMPT_PRESETS[this.presetKey];
          if (preset) {
            this.plugin.settings.customPrompt = preset.prompt;
            await this.plugin.saveSettings();
            this.display(); // refresh to show updated text area
          }
        });
      })
      .addButton((btn) => {
        btn.setButtonText('Restore default').onClick(async () => {
          this.plugin.settings.customPrompt = DEFAULT_PROMPT;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    const promptSetting = new Setting(containerEl).setName('Custom prompt');

    promptSetting.setDesc(
      'Use {{content}} as the placeholder for the note text. The plugin will inject the note content into that spot.'
    );

    promptSetting.addTextArea((ta) => {
      promptAreaRef = ta;
      ta.inputEl.rows = 10;
      ta.inputEl.style.width = '100%';
      ta.setValue(this.plugin.settings.customPrompt);
      ta.onChange(async (val) => {
        this.plugin.settings.customPrompt = val;
        await this.plugin.saveSettings();
      });
    });

    // Small tip
    const tip = containerEl.createEl('p');
    tip.style.opacity = '0.8';
    tip.textContent =
      'Tip: End your prompt with “Return only the title.” for the cleanest results.';
  }
}

export default class TitleGeneratorPlugin extends Plugin {
  settings: TitleGeneratorSettings;

  openai: OpenAI;

  private renderPrompt(content: string): string {
    const tmpl = this.settings.customPrompt?.trim() || DEFAULT_PROMPT;
    return tmpl.replace(/\{\{\s*content\s*\}\}/gi, content);
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const model = this.settings.openAiModel?.trim() || 'gpt-5-nano-2025-08-07';

    if (!this.openai) {
      this.openai = new OpenAI({
        apiKey: this.settings.openAiApiKey,
        dangerouslyAllowBrowser: true,
      });
    }

    if (useCompletionsEndpoint(model)) {
      const response = await this.openai.completions.create({
        model,
        prompt,
        max_tokens: 50,
        temperature: 0.6,
      });
      return (response.choices?.[0]?.text ?? '').trim();
    }

    // For GPT-5 models, use the new parameters
    const response = await this.openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_completion_tokens: 50, // Use max_completion_tokens for GPT-5
      reasoning_effort: "minimal", // Fast response for simple tasks
      verbosity: "low", // Concise output for titles
      n: 1,
    });
    return (response.choices?.[0]?.message?.content ?? '').trim();
  }

  private async callFireworks(prompt: string): Promise<string> {
    // Fireworks Responses API with store=false by default.
    // API shape documented here: https://docs.fireworks.ai/api-reference/post-responses
    // We read output_text for convenience. ([docs.fireworks.ai](https://docs.fireworks.ai/api-reference/post-responses?utm_source=openai))
    const model = this.settings.fireworksModel?.trim();
    if (!model) throw new Error('Fireworks model is required.');

    const apiKey = this.settings.fireworksApiKey?.trim();
    if (!apiKey) throw new Error('Fireworks API key is required.');

    const body = {
      model,
      input: prompt,
      max_output_tokens: 50,
      temperature: 0.6,
      store: false, // explicitly disable storage by default
    };

    const res = await fetch(`${FIREWORKS_BASE_URL}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Fireworks API error ${res.status}: ${text}`);
    }

    const data: any = await res.json();

    // Prefer output_text if present, otherwise dig into output array
    let out = (data.output_text ?? '').toString().trim();
    if (!out && Array.isArray(data.output) && data.output.length > 0) {
      try {
        const last = data.output[data.output.length - 1];
        out = last?.content?.[0]?.text?.toString()?.trim() ?? '';
      } catch {
        // ignore
      }
    }
    return out;
  }

  private async generateTitle(file: TFile, content: string) {
    const loadingStatus = this.addStatusBarItem();
    loadingStatus.createEl('span', { text: 'Generating title...' });

    try {
      const prompt = this.renderPrompt(content);
      let raw = '';

      if (this.settings.provider === 'fireworks') {
        raw = await this.callFireworks(prompt);
      } else {
        if (!this.settings.openAiApiKey) {
          throw new Error('Please set your OpenAI API key in the settings.');
        }
        raw = await this.callOpenAI(prompt);
      }

      let title = stripSurroundingQuotes(raw);
      title = removeInvalidFileNameChars(title);

      if (!title) {
        throw new Error('Model returned an empty title.');
      }

      const currentPath = path.parse(file.path);
      const newPath = normalizePath(
        `${currentPath.dir}/${title}${currentPath.ext}`
      );

      await this.app.fileManager.renameFile(file, newPath);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      new Notice(`Unable to generate title:\n\n${err}`);
    } finally {
      loadingStatus.remove();
    }
  }

  private async generateTitleFromFile(file: TFile) {
    const content = await file.vault.cachedRead(file);
    return this.generateTitle(file, content);
  }

  private async generateTitleFromEditor(editor: Editor) {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      throw new Error('No active file');
    }

    const content = editor.getValue();
    this.generateTitle(activeFile, content);
  }

  async onload() {
    await this.loadSettings();

    // Initialize OpenAI client only once (used for OpenAI provider).
    this.openai = new OpenAI({
      apiKey: this.settings.openAiApiKey,
      dangerouslyAllowBrowser: true,
    });

    this.addCommand({
      id: 'title-generator-generate-title',
      name: 'Generate title',
      editorCallback: (editor) => this.generateTitleFromEditor(editor),
    });

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile)) {
          return;
        }

        menu.addItem((item) => {
          item
            .setTitle('Generate title')
            .setIcon('lucide-edit-3')
            .onClick(() => this.generateTitleFromFile(file));
        });
      })
    );

    this.registerEvent(
      this.app.workspace.on('files-menu', (menu, files) => {
        const tFiles = files.filter((f) => f instanceof TFile) as TFile[];
        if (tFiles.length < 1) {
          return;
        }

        menu.addItem((item) => {
          item
            .setTitle('Generate titles')
            .setIcon('lucide-edit-3')
            .onClick(() =>
              pMap<TFile, void>(tFiles, (f) => this.generateTitleFromFile(f), {
                concurrency: 1,
              })
            );
        });
      })
    );

    this.addSettingTab(new TitleGeneratorSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.openai) {
      this.openai.apiKey = this.settings.openAiApiKey;
    }
  }
}
