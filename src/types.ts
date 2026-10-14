export type AgentName = 'claude' | 'codex'

export type EventType = 'prompt' | 'assistant_message' | 'tool_call' | 'tool_result' | 'usage'

export interface LensEvent {
  uid: string
  ts: number
  type: EventType
  tool: string | null
  isError: boolean
  text: string
  inputTokens: number
  outputTokens: number
  /** Links a tool_call to its tool_result. Null when the agent gives no id. */
  callId: string | null
}

export interface ParsedSession {
  sessionId: string
  agent: AgentName
  cwd: string | null
  model: string | null
  title: string | null
  events: LensEvent[]
}

export interface Adapter {
  agent: AgentName
  /** Absolute paths of session files under `root`. Returns [] if root is missing. */
  discover(root: string): string[]
  /** Parse one session file. Returns null if the file holds no usable session. */
  parse(file: string, content: string): ParsedSession | null
}

export interface SessionRow {
  id: string
  agent: AgentName
  cwd: string | null
  model: string | null
  title: string | null
  started_at: number
  ended_at: number
  prompts: number
  tool_calls: number
  errors: number
  input_tokens: number
  output_tokens: number
}

export interface EventRow {
  id: number
  session_id: string
  ts: number
  type: EventType
  tool: string | null
  is_error: number
  text: string
  input_tokens: number
  output_tokens: number
  call_id: string | null
}
