import { RlsContextState } from '../common/rls/rls-context';
import { createRlsWrapper } from './rls.transaction';

describe('createRlsWrapper (ADR-0002 GUC arming)', () => {
  const ctx = (state?: RlsContextState) => () => state;

  it('passes the operation straight through without a tenant context', () => {
    const query = jest.fn((args: unknown) => ({ result: args }));
    const setConfig = jest.fn();
    const runTransaction = jest.fn();
    const wrapper = createRlsWrapper({ getContext: ctx(undefined), setConfig, runTransaction });

    const out = wrapper({ args: 'A', query });

    expect(query).toHaveBeenCalledWith('A');
    expect(out).toEqual({ result: 'A' });
    expect(setConfig).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('passes through inside an already-armed interactive transaction (inTx)', () => {
    const query = jest.fn((args: unknown) => args);
    const setConfig = jest.fn();
    const runTransaction = jest.fn();
    const wrapper = createRlsWrapper({
      getContext: ctx({ tenantId: 't1', inTx: true }),
      setConfig,
      runTransaction,
    });

    expect(wrapper({ args: 1, query })).toBe(1);
    expect(setConfig).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('arms the tenant GUC and returns the op result flattened from the array-form transaction', async () => {
    const query = jest.fn((args: unknown) => ({ id: args }));
    const setConfig = jest.fn((tid: string) => `setcfg:${tid}`);
    const runTransaction = jest.fn(async (ops: unknown[]) => [ops[0], { id: 'op' }]);
    const wrapper = createRlsWrapper({
      getContext: ctx({ tenantId: 't1' }),
      setConfig,
      runTransaction,
    });

    const out = await wrapper({ args: 'op', query });

    expect(setConfig).toHaveBeenCalledWith('t1');
    expect(runTransaction).toHaveBeenCalledWith(['setcfg:t1', { id: 'op' }]);
    expect(out).toEqual({ id: 'op' });
  });
});
