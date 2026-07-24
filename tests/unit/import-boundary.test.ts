import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

describe('credential import boundaries', () => {
  const eslint = new ESLint({ cwd: process.cwd() });

  async function messagesFor(code: string, filePath: string): Promise<string[]> {
    const [result] = await eslint.lintText(code, { filePath });
    return (result?.messages ?? []).map((message) => message.message);
  }

  it('Content Script 禁止导入任何 credential-store API', async () => {
    const messages = await messagesFor(
      "import { readCredential } from '../background/credential-store';",
      'src/content/credential-violation.ts',
    );
    expect(messages.join('\n')).toContain('Content Script 不得导入');
  });

  it('Options 禁 read/inject，Background 禁 write/delete', async () => {
    const optionsMessages = await messagesFor(
      "import { readCredential } from '../background/credential-store';",
      'src/options/credential-violation.ts',
    );
    const backgroundMessages = await messagesFor(
      "import { writeCredential } from './credential-store';",
      'src/background/credential-violation.ts',
    );
    expect(optionsMessages.join('\n')).toContain('Options 只允许 write/delete');
    expect(backgroundMessages.join('\n')).toContain('Background 只允许 read/inject');
  });
});
