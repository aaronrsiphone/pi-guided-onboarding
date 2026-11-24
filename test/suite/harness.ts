// A real pi session for tests, built with pi's public SDK: pi's tools, the given extensions, and a
// faux model that answers with scripted responses. No real provider, key, or network.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model, ToolResultMessage } from "@earendil-works/pi-ai";
import { type FauxProviderRegistration, type FauxResponseStep, registerFauxProvider } from "@earendil-works/pi-ai/compat";
import {
	type AgentSession,
	createAgentSession,
	DefaultResourceLoader,
	type ExtensionFactory,
	type ExtensionUIContext,
	SessionManager,
	SettingsManager,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { fauxAgentDir } from "../pi-guided-faux.ts";

export interface HarnessOptions {
	extensionFactories?: ExtensionFactory[];
}

export interface Harness {
	session: AgentSession;
	sessionManager: SessionManager;
	faux: FauxProviderRegistration;
	getModel(): Model<string>;
	setResponses(responses: FauxResponseStep[]): void;
	/** The folder the session works in. */
	tempDir: string;
	cleanup(): void;
}

/** Start a session in a new temporary folder with the faux model selected. */
export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
	const base = mkdtempSync(join(tmpdir(), "pi-guided-suite-"));
	const faux = registerFauxProvider();
	faux.setResponses([]);
	// The session finds the faux model the way a user's pi finds any model: through models.json.
	const agentDir = fauxAgentDir(faux, base);
	const settingsManager = SettingsManager.create(base, agentDir);
	const resourceLoader = new DefaultResourceLoader({
		cwd: base,
		agentDir,
		settingsManager,
		noExtensions: true,
		extensionFactories: options.extensionFactories ?? [],
	});
	await resourceLoader.reload();
	const sessionManager = SessionManager.inMemory(base);
	const { session } = await createAgentSession({
		cwd: base,
		agentDir,
		model: faux.getModel(),
		settingsManager,
		sessionManager,
		resourceLoader,
	});
	return {
		session,
		sessionManager,
		faux,
		getModel: faux.getModel,
		setResponses: faux.setResponses,
		tempDir: base,
		cleanup() {
			session.dispose();
			faux.unregister();
			rmSync(base, { recursive: true, force: true });
		},
	};
}

/** The latest result of `toolName` in the session transcript. */
export function getToolResult(harness: Harness, toolName: string): ToolResultMessage {
	const result = harness.session.messages.findLast(
		(message): message is ToolResultMessage => message.role === "toolResult" && message.toolName === toolName,
	);
	if (!result) throw new Error(`No ${toolName} tool result`);
	return result;
}

/** An extension UI context that does nothing, with `overrides` applied. */
export function createTestUiContext(overrides: Partial<ExtensionUIContext> = {}): ExtensionUIContext {
	return {
		select: async () => undefined,
		confirm: async () => false,
		input: async () => undefined,
		notify: () => {},
		onTerminalInput: () => () => {},
		setStatus: () => {},
		setWorkingMessage: () => {},
		setWorkingVisible: () => {},
		setWorkingIndicator: () => {},
		setHiddenThinkingLabel: () => {},
		setWidget: () => {},
		setFooter: () => {},
		setHeader: () => {},
		setTitle: () => {},
		custom: async <T>() => undefined as T,
		pasteToEditor: () => {},
		setEditorText: () => {},
		getEditorText: () => "",
		editor: async () => undefined,
		addAutocompleteProvider: () => {},
		setEditorComponent: () => {},
		getEditorComponent: () => undefined,
		// No test renders anything, and the theme is only loaded by pi's interactive mode.
		theme: undefined as unknown as Theme,
		getAllThemes: () => [],
		getTheme: () => undefined,
		setTheme: () => ({ success: false, error: "Theme switching not available in tests" }),
		getToolsExpanded: () => false,
		setToolsExpanded: () => {},
		...overrides,
	};
}
