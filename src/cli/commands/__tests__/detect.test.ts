import { detectCommand } from '../detect';
import { assistRecommendedIntegrationInstall } from '../../../cli-core/integration-installer';
import { detectNovaEnvironment } from '../../../cli-core/detect';

jest.mock('../../../cli-core/detect', () => ({
  detectNovaEnvironment: jest.fn(),
}));

jest.mock('../../../cli-core/integration-installer', () => ({
  assistRecommendedIntegrationInstall: jest.fn(),
}));

describe('detectCommand', () => {
  const detectMock = detectNovaEnvironment as jest.Mock;
  const installMock = assistRecommendedIntegrationInstall as jest.Mock;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  const baseResult = {
    pass: true,
    agent: {
      active: {
        id: 'codex',
        name: 'Codex',
        source: 'option',
        confidence: 'high',
        summary: 'Active Agent supplied by --agent: Codex',
      },
      configured: ['codex'],
      available: [{ id: 'codex', name: 'Codex', available: true }],
    },
    tools: [
      {
        id: 'nova-state',
        name: 'Nova state',
        category: 'required',
        status: 'available',
        summary: '.nova.yaml found',
        details: [],
      },
      {
        id: 'ui-ux-pro-max',
        name: 'UI UX Pro Max',
        category: 'recommended',
        status: 'missing',
        summary: 'missing',
        install: 'Run: npx uipro-cli init --ai codex',
        details: [],
      },
    ],
  };

  beforeEach(() => {
    detectMock.mockReset();
    installMock.mockReset();
    detectMock.mockResolvedValue(baseResult);
    installMock.mockResolvedValue(null);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('does not install in default read-only mode', async () => {
    await detectCommand({ agent: 'codex' });

    expect(detectMock).toHaveBeenCalledWith({ agent: 'codex' });
    expect(installMock).not.toHaveBeenCalled();
  });

  test('install flag enters recommended integration install flow', async () => {
    await detectCommand({ agent: 'codex', install: true });

    expect(installMock).toHaveBeenCalledWith(expect.objectContaining({
      agent: 'codex',
      tools: baseResult.tools,
    }));
  });
});
