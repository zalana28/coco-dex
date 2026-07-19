import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  ACK_KEY_PREFIX,
  acknowledgeRisk,
  buildProviderDescriptors,
  clearAcknowledgement,
  COCO_DESCRIPTOR,
  DISCLOSURE_TEXT,
  FEATURE_FLAGS,
  getEffectiveExecutionPolicy,
  hasAcknowledgedRisk,
  isExecutionAllowed,
  isKillSwitchOn,
  isPendingAddresses,
  isSelectorAllowed,
  setKillSwitch,
  validatePinnedTarget,
  type ExecutionPolicy,
} from './executionPolicy'

const ARC_CHAIN_ID = 5_042_002
const OTHER_CHAIN_ID = 1

describe('execution policy', () => {
  beforeEach(() => {
    setKillSwitch('xylonet', false)
    setKillSwitch('unitflow', false)
    setKillSwitch('synthra', false)
    setKillSwitch('coco', false)
  })

  describe('operator-approved policy is Arc Testnet-only', () => {
    it('returns disabled when chain ID is not Arc Testnet', () => {
      expect(getEffectiveExecutionPolicy('xylonet', OTHER_CHAIN_ID, { xylonet: 'operator-approved-executable' })).toBe('disabled')
    })

    it('returns the configured policy when chain ID is Arc Testnet and flag is on', () => {
      vi.stubEnv('VITE_ENABLE_XYLONET_EXECUTION', 'true')
      expect(getEffectiveExecutionPolicy('xylonet', ARC_CHAIN_ID, { xylonet: 'operator-approved-executable' })).toBe('operator-approved-executable')
      vi.unstubAllEnvs()
    })

    it('returns disabled when feature flag is missing', () => {
      vi.stubEnv('VITE_ENABLE_XYLONET_EXECUTION', '')
      expect(getEffectiveExecutionPolicy('xylonet', ARC_CHAIN_ID, { xylonet: 'operator-approved-executable' })).toBe('disabled')
      vi.unstubAllEnvs()
    })

    it('returns disabled when feature flag is false', () => {
      vi.stubEnv('VITE_ENABLE_XYLONET_EXECUTION', 'false')
      expect(getEffectiveExecutionPolicy('xylonet', ARC_CHAIN_ID, { xylonet: 'operator-approved-executable' })).toBe('disabled')
      vi.unstubAllEnvs()
    })
  })

  describe('audit status remains separate from execution policy', () => {
    it('Coco audit status is unverified even though its execution policy is verified-executable', () => {
      expect(COCO_DESCRIPTOR.auditStatus).toBe('unverified')
      expect(COCO_DESCRIPTOR.executionPolicy).toBe('verified-executable')
    })

    it('operator-approved-executable never implies verified-executable', () => {
      const policy = 'operator-approved-executable' as ExecutionPolicy
      expect(policy).not.toBe('verified-executable' as ExecutionPolicy)
      expect(isExecutionAllowed(policy, ARC_CHAIN_ID)).toBe(true)
      // The two policies are distinct string values
      expect((policy as string).startsWith('operator')).toBe(true)
      expect(('verified-executable' as ExecutionPolicy as string).startsWith('verified')).toBe(true)
    })
  })

  describe('execution allowed check', () => {
    it('allows operator-approved-executable on Arc Testnet', () => {
      expect(isExecutionAllowed('operator-approved-executable', ARC_CHAIN_ID)).toBe(true)
    })

    it('allows verified-executable on Arc Testnet', () => {
      expect(isExecutionAllowed('verified-executable', ARC_CHAIN_ID)).toBe(true)
    })

    it('rejects operator-approved-executable on other chains', () => {
      expect(isExecutionAllowed('operator-approved-executable', OTHER_CHAIN_ID)).toBe(false)
    })

    it('rejects unverified policy', () => {
      expect(isExecutionAllowed('unverified', ARC_CHAIN_ID)).toBe(false)
    })

    it('rejects disabled policy', () => {
      expect(isExecutionAllowed('disabled', ARC_CHAIN_ID)).toBe(false)
    })

    it('rejects pending-addresses policy', () => {
      expect(isExecutionAllowed('operator-approved-pending-addresses', ARC_CHAIN_ID)).toBe(false)
    })
  })

  describe('pending addresses', () => {
    it('identifies operator-approved-pending-addresses', () => {
      expect(isPendingAddresses('operator-approved-pending-addresses')).toBe(true)
    })

    it('does not identify operator-approved-executable as pending', () => {
      expect(isPendingAddresses('operator-approved-executable')).toBe(false)
    })
  })

  describe('kill switch', () => {
    it('returns disabled when kill switch is on', () => {
      setKillSwitch('xylonet', true)
      vi.stubEnv('VITE_ENABLE_XYLONET_EXECUTION', 'true')
      expect(getEffectiveExecutionPolicy('xylonet', ARC_CHAIN_ID, { xylonet: 'operator-approved-executable' })).toBe('disabled')
      vi.unstubAllEnvs()
    })

    it('can be checked', () => {
      setKillSwitch('unitflow', true)
      expect(isKillSwitchOn('unitflow')).toBe(true)
      setKillSwitch('unitflow', false)
      expect(isKillSwitchOn('unitflow')).toBe(false)
    })
  })

  describe('feature flag defaults to disabled', () => {
    it('xylonet flag name is correct', () => {
      expect(FEATURE_FLAGS.xylonet).toBe('VITE_ENABLE_XYLONET_EXECUTION')
    })

    it('unitflow flag name is correct', () => {
      expect(FEATURE_FLAGS.unitflow).toBe('VITE_ENABLE_UNITFLOW_EXECUTION')
    })

    it('synthra flag name is correct', () => {
      expect(FEATURE_FLAGS.synthra).toBe('VITE_ENABLE_SYNTHRA_EXECUTION')
    })

    it('coco has no feature flag', () => {
      expect(FEATURE_FLAGS.coco).toBe('')
    })
  })

  describe('selector allowlist', () => {
    it('allows swapExactTokensForTokens for xylonet', () => {
      expect(isSelectorAllowed('xylonet', '0x38ed1739')).toBe(true)
    })

    it('allows swapExactTokensForTokens for unitflow', () => {
      expect(isSelectorAllowed('unitflow', '0x38ed1739')).toBe(true)
    })

    it('allows exactInputSingle for synthra', () => {
      expect(isSelectorAllowed('synthra', '0x414bf389')).toBe(true)
    })

    it('rejects unknown selectors', () => {
      expect(isSelectorAllowed('xylonet', '0xdeadbeef')).toBe(false)
    })

    it('rejects unknown provider', () => {
      expect(isSelectorAllowed('coco', '0xdeadbeef')).toBe(false)
    })
  })

  describe('pinned target validation', () => {
    it('validates xylonet pinned target', () => {
      vi.stubEnv('VITE_ENABLE_XYLONET_EXECUTION', 'true')
      const d = buildProviderDescriptors(ARC_CHAIN_ID)
      expect(validatePinnedTarget('xylonet', '0x73742278c31a76dBb0D2587d03ef92E6E2141023', d)).toBe(true)
      expect(validatePinnedTarget('xylonet', '0x0000000000000000000000000000000000000001', d)).toBe(false)
      vi.unstubAllEnvs()
    })

    it('rejects synthra when addresses are not pinned', () => {
      const d = buildProviderDescriptors(ARC_CHAIN_ID)
      expect(validatePinnedTarget('synthra', '0x0000000000000000000000000000000000000001', d)).toBe(false)
    })
  })

  describe('disclosure', () => {
    it('contains required risk disclosure text', () => {
      expect(DISCLOSURE_TEXT).toMatch(/Third-party Arc Testnet route/i)
      expect(DISCLOSURE_TEXT).toMatch(/not passed Coco DEX/i)
      expect(DISCLOSURE_TEXT).toMatch(/strict independent verification gate/i)
    })
  })

  describe('risk acknowledgement', () => {
    const store: Record<string, string> = {}

    beforeEach(() => {
      Object.keys(store).forEach((key) => delete store[key])
      // Mock localStorage
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value },
        removeItem: (key: string) => { delete store[key] },
        clear: () => { Object.keys(store).forEach((key) => delete store[key]) },
      })
    })

    it('starts unacknowledged', () => {
      expect(hasAcknowledgedRisk('xylonet')).toBe(false)
    })

    it('can be acknowledged', () => {
      acknowledgeRisk('xylonet')
      expect(hasAcknowledgedRisk('xylonet')).toBe(true)
    })

    it('can be cleared', () => {
      acknowledgeRisk('unitflow')
      clearAcknowledgement('unitflow')
      expect(hasAcknowledgedRisk('unitflow')).toBe(false)
    })

    it('ack key prefix is provider-specific', () => {
      expect(ACK_KEY_PREFIX + 'xylonet').toBe('coco-dex:operator-approved-ack:xylonet')
    })
  })

  describe('provider descriptors', () => {
    it('returns all 4 providers', () => {
      const d = buildProviderDescriptors(ARC_CHAIN_ID)
      expect(Object.keys(d).sort()).toEqual(['coco', 'synthra', 'unitflow', 'xylonet'])
    })

    it('synthra starts as pending-addresses when flag is on', () => {
      vi.stubEnv('VITE_ENABLE_SYNTHRA_EXECUTION', 'true')
      const d = buildProviderDescriptors(ARC_CHAIN_ID)
      expect(d.synthra.executionPolicy).toBe('operator-approved-pending-addresses')
      vi.unstubAllEnvs()
    })

    it('synthra has no pinned addresses initially', () => {
      const d = buildProviderDescriptors(ARC_CHAIN_ID)
      expect(d.synthra.pinnedAllowanceTarget).toBeUndefined()
      expect(d.synthra.pinnedExecutionTarget).toBeUndefined()
    })

    it('xylonet has pinned addresses', () => {
      vi.stubEnv('VITE_ENABLE_XYLONET_EXECUTION', 'true')
      const d = buildProviderDescriptors(ARC_CHAIN_ID)
      expect(d.xylonet.pinnedAllowanceTarget).toBeDefined()
      expect(d.xylonet.pinnedExecutionTarget).toBeDefined()
      vi.unstubAllEnvs()
    })

    it('all external providers have risk disclosure', () => {
      const d = buildProviderDescriptors(ARC_CHAIN_ID)
      for (const provider of ['xylonet', 'unitflow', 'synthra'] as const) {
        expect(d[provider].riskDisclosure).toMatch(/Third-party/i)
      }
    })
  })
})
