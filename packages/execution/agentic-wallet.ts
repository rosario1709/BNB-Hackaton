import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import type { Transaction } from '../core/domain';
const exec = promisify(execFile);
export class AgenticWallet {
  async call<T>(args: string[], schema: z.ZodType<T>): Promise<T> {
    const executable = process.env.ATLAS_BAW_EXECUTABLE;
    if (!executable || !isAbsolute(executable))
      throw new Error(
        'Set ATLAS_BAW_EXECUTABLE to the absolute official baw executable or JavaScript entrypoint.',
      );
    if (/\.(cmd|bat|ps1)$/i.test(executable))
      throw new Error(
        'Use the official CLI JavaScript entrypoint on Windows; shell wrappers are not executed.',
      );
    const isJs = /\.[cm]?js$/i.test(executable);
    const { stdout } = await exec(
      isJs ? process.execPath : executable,
      [...(isJs ? [executable] : []), ...args, '--json'],
      { timeout: 30000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, shell: false },
    ).catch(() => { throw new Error('Agentic Wallet CLI could not complete the command. Verify the official installation, absolute ATLAS_BAW_EXECUTABLE path and Binance sign-in; run pnpm wallet status. On Windows use the installed JavaScript entrypoint, not a shell wrapper.'); });
    const envelope = z
      .object({ success: z.boolean(), data: z.unknown().optional() })
      .parse(JSON.parse(stdout));
    if (!envelope.success)
      throw new Error('Agentic Wallet rejected the operation. Review its state in Binance.');
    return schema.parse(envelope.data);
  }
  status() {
    return this.call(
      ['wallet', 'status'],
      z.object({ status: z.enum(['CONNECTED', 'UNCONNECTED', 'CREATING']) }),
    );
  }
  addresses() {
    return this.call(
      ['wallet', 'address'],
      z.object({
        addresses: z.array(z.object({ binanceChainId: z.string(), address: z.string() })),
      }),
    );
  }
  settings() {
    return this.call(
      ['wallet', 'settings'],
      z.object({ devMode: z.object({ enabled: z.boolean() }).optional() }).passthrough(),
    );
  }
  balances() {
    return this.call(
      ['wallet', 'balance', '--binanceChainId', '56'],
      z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]),
    );
  }
  async preview(tx: Transaction) {
    const settings = await this.settings();
    if (!settings.devMode?.enabled)
      throw new Error(
        'Enable Developer Mode yourself in the Binance App before previewing external transactions.',
      );
    return this.call(
      [
        'contract-call',
        'preview',
        '--binanceChainId',
        '56',
        '--from',
        tx.from,
        '--to',
        tx.to,
        '--value',
        tx.value,
        '--inputData',
        tx.data,
      ],
      z.object({
        requestId: z.string(),
        expiresAt: z.number(),
        parsedTx: z.record(z.string(), z.unknown()),
        simulationResult: z.object({
          simulationCode: z.string(),
          simulationErrorDetail: z.unknown().nullable(),
        }),
        risks: z.object({
          riskDetails: z.array(z.unknown()),
          addresses: z.record(z.string(), z.unknown()),
          riskBehaviors: z.array(z.unknown()),
        }),
        requireConfirmation: z.boolean(),
      }),
    );
  }
  execute(requestId: string) {
    return this.call(
      ['contract-call', 'execute', '--requestId', requestId],
      z.object({
        orderId: z.string(),
        status: z.enum(['BROADCASTED', 'PENDING_CONFIRMATION']),
        txHash: z.string().nullable(),
        message: z.string().nullable(),
      }),
    );
  }
}
