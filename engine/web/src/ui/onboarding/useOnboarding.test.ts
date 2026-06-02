import { describe, expect, it, beforeEach } from 'vitest';
import { useOnboarding } from './useOnboarding';

describe('useOnboarding store', () => {
  beforeEach(() => {
    useOnboarding.setState({ isOpen: false, completed: false });
  });

  it('open() opens the wizard', () => {
    useOnboarding.getState().open();
    expect(useOnboarding.getState().isOpen).toBe(true);
  });

  it('close() closes without marking completed', () => {
    useOnboarding.setState({ isOpen: true, completed: false });
    useOnboarding.getState().close();
    expect(useOnboarding.getState().isOpen).toBe(false);
    expect(useOnboarding.getState().completed).toBe(false);
  });

  it('markCompleted() closes and sets completed', () => {
    useOnboarding.setState({ isOpen: true, completed: false });
    useOnboarding.getState().markCompleted();
    expect(useOnboarding.getState().isOpen).toBe(false);
    expect(useOnboarding.getState().completed).toBe(true);
  });

  it('reopen() opens even after completion, without clearing the flag', () => {
    useOnboarding.setState({ isOpen: false, completed: true });
    useOnboarding.getState().reopen();
    expect(useOnboarding.getState().isOpen).toBe(true);
    expect(useOnboarding.getState().completed).toBe(true);
  });

  it('shouldAutoOpen is true only when not completed', () => {
    expect(useOnboarding.getState().shouldAutoOpen()).toBe(true);
    useOnboarding.getState().markCompleted();
    expect(useOnboarding.getState().shouldAutoOpen()).toBe(false);
  });
});
