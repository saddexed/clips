const VALUE_OPTIONS = new Set([
  "-c:v", "-profile:v", "-pix_fmt", "-deadline", "-cpu-used", "-tile-columns", "-tile-rows",
  "-threads", "-row-mt", "-crf", "-b:v", "-maxrate", "-bufsize", "-c:a", "-b:a",
]);
const SHELL_CONTROL = /[;&|<>`$\\\n\r]/;

function tokenize(value: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) tokens.push(match[1] ?? match[2] ?? match[3]);
  return tokens;
}

export function parseFfmpegParameters(input: string): string[] {
  const value = input.trim();
  if (!value) throw new Error("Encoder parameters cannot be empty.");
  if (SHELL_CONTROL.test(value)) throw new Error("Encoder parameters contain unsupported shell-control characters.");
  const tokens = tokenize(value);
  if (tokens[0]?.toLowerCase() === "ffmpeg") tokens.shift();
  if (!tokens.length) throw new Error("Encoder parameters cannot be empty.");
  const result: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const option = tokens[index];
    if (!option.startsWith("-") || ["-i", "-y", "-n", "-f"].includes(option)) throw new Error(`Managed or malformed ffmpeg option: ${option}`);
    if (!VALUE_OPTIONS.has(option)) throw new Error(`Unsupported encoder option: ${option}`);
    result.push(option);
    const argument = tokens[++index];
    if (!argument || argument.startsWith("-") || SHELL_CONTROL.test(argument)) throw new Error(`Missing value for ${option}.`);
    result.push(argument);
  }
  return result;
}
