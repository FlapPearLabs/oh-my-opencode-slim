import { describe, expect, test } from 'bun:test';
import {
  BackgroundTaskConcurrency,
  BackgroundTaskConcurrencyQueueCancelledError,
} from './background-task-concurrency';

const limited = (overrides = {}) =>
  new BackgroundTaskConcurrency({
    defaultConcurrency: 1,
    providerConcurrency: {},
    modelConcurrency: {},
    ...overrides,
  });

describe('BackgroundTaskConcurrency', () => {
  test('admits one task and queues the next task', async () => {
    const scheduler = limited();
    const first = scheduler.acquire({ model: 'openai/fast' });
    const second = scheduler.acquire({ model: 'openai/fast' });

    await first.ready;
    expect(scheduler.snapshot()).toEqual({ active: 1, queued: 1 });

    let secondReady = false;
    void second.ready.then(() => {
      secondReady = true;
    });
    await Promise.resolve();
    expect(secondReady).toBe(false);

    first.bind('ses_first');
    scheduler.releaseTask('ses_first');
    await second.ready;
    expect(scheduler.snapshot()).toEqual({ active: 1, queued: 0 });
  });

  test('preserves admission order under the default cap', async () => {
    const scheduler = limited();
    const first = scheduler.acquire({ model: 'openai/fast' });
    const second = scheduler.acquire({ model: 'openai/fast' });
    const order: string[] = [];

    await first.ready;
    order.push('first');
    first.bind('ses_first');
    void second.ready.then(() => order.push('second'));
    scheduler.releaseTask('ses_first');
    await second.ready;

    expect(order).toEqual(['first', 'second']);
  });

  test('applies model and provider caps alongside the default cap', async () => {
    const scheduler = new BackgroundTaskConcurrency({
      defaultConcurrency: 3,
      providerConcurrency: { openai: 1 },
      modelConcurrency: { 'anthropic/slow': 1 },
    });
    const openaiFirst = scheduler.acquire({ model: 'openai/fast' });
    const openaiSecond = scheduler.acquire({ model: 'openai/cheap' });
    const anthropic = scheduler.acquire({ model: 'anthropic/slow' });

    await openaiFirst.ready;
    await anthropic.ready;
    expect(scheduler.snapshot()).toEqual({ active: 2, queued: 1 });

    openaiFirst.bind('ses_openai');
    scheduler.releaseTask('ses_openai');
    await openaiSecond.ready;
    expect(scheduler.snapshot()).toEqual({ active: 2, queued: 0 });
  });

  test('a model cap takes precedence over an unrestricted default', async () => {
    const scheduler = new BackgroundTaskConcurrency({
      defaultConcurrency: 0,
      providerConcurrency: {},
      modelConcurrency: { 'openai/slow': 1 },
    });
    const first = scheduler.acquire({ model: 'openai/slow' });
    const second = scheduler.acquire({ model: 'openai/slow' });

    await first.ready;
    expect(scheduler.snapshot()).toEqual({ active: 1, queued: 1 });
    first.release();
    await second.ready;
  });

  test('does not cap tasks when all limits are disabled', async () => {
    const scheduler = new BackgroundTaskConcurrency({
      defaultConcurrency: 0,
      providerConcurrency: {},
      modelConcurrency: {},
    });
    const first = scheduler.acquire({ model: 'openai/fast' });
    const second = scheduler.acquire({ model: 'anthropic/slow' });

    await Promise.all([first.ready, second.ready]);
    expect(scheduler.snapshot()).toEqual({ active: 2, queued: 0 });
  });

  test('releasing an unbound ticket removes it from the queue', async () => {
    const scheduler = limited();
    const first = scheduler.acquire({ model: 'openai/fast' });
    const second = scheduler.acquire({ model: 'openai/fast' });

    await first.ready;
    second.releaseIfUnbound();
    await expect(second.ready).rejects.toBeInstanceOf(
      BackgroundTaskConcurrencyQueueCancelledError,
    );
    expect(scheduler.snapshot()).toEqual({ active: 1, queued: 0 });
    first.release();
  });

  test('dispose cancels queued tickets and releases active capacity', async () => {
    const scheduler = limited();
    const first = scheduler.acquire({ model: 'openai/fast' });
    const second = scheduler.acquire({ model: 'openai/fast' });

    await first.ready;
    scheduler.dispose();

    await expect(second.ready).rejects.toBeInstanceOf(
      BackgroundTaskConcurrencyQueueCancelledError,
    );
    expect(scheduler.snapshot()).toEqual({ active: 0, queued: 0 });
  });
});
