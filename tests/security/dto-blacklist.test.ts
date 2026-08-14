/**
 * Field-whitelist contract test.
 *
 * PDF §7.3 lists fields that must never reach the portal, and §10 makes it a
 * go-live gate: "no blacklisted field appears in any API response (automated
 * contract test)".
 *
 * The DTOs being hand-written is the primary control. This is the independent
 * proof: every composed response is walked to its leaves and checked against the
 * blacklist, so a leak introduced by a future edit fails the build.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { getDashboard } from '@/application/dashboard'
import { getProjectDetail } from '@/application/project-detail'
import { getProjects } from '@/application/projects'
import { findForbiddenKeys } from '@/dto/forbidden-keys'
import { PROJECT_A1, PROJECT_A2, TENANT_A } from '@/providers'
import { testDeps } from '../support/deps'

async function allPayloads() {
  const deps = testDeps()
  const [dashboard, projects, detail1, detail2] = await Promise.all([
    getDashboard(deps, TENANT_A),
    getProjects(deps, TENANT_A),
    getProjectDetail(deps, TENANT_A, PROJECT_A1),
    getProjectDetail(deps, TENANT_A, PROJECT_A2),
  ])
  return {
    dashboard: dashboard.value,
    projects: projects.value,
    'project-detail A1': detail1.value,
    'project-detail A2': detail2.value,
  }
}

describe('no blacklisted field in any response', () => {
  test('every composed payload is clean', async () => {
    for (const [name, payload] of Object.entries(await allPayloads())) {
      const hits = findForbiddenKeys(payload)
      assert.deepEqual(hits, [], `${name} leaked: ${hits.join(', ')}`)
    }
  })

  test('the walker actually catches a leak (guards against a vacuous pass)', () => {
    // If this failed, every assertion above would be meaningless.
    assert.ok(findForbiddenKeys({ items: [{ bom_material_cost: 1 }] }).length > 0)
    assert.ok(findForbiddenKeys({ deep: { nested: { supplierName: 'x' } } }).length > 0)
    assert.ok(findForbiddenKeys({ contact: 'someone@powerline.com.eg' }).length > 0)
    assert.ok(findForbiddenKeys({ label: 'MFG-WO-2024-00062' }).length > 0)
  })
})

describe('specific rules from the brief and the approved decisions', () => {
  test('no internal work order id appears in a payload', async () => {
    for (const [name, payload] of Object.entries(await allPayloads())) {
      assert.equal(/MFG-WO-/.test(JSON.stringify(payload)), false, `${name} exposed a work order id`)
    }
  })

  test('no money figure or currency is presented (decision D3)', async () => {
    for (const [name, payload] of Object.entries(await allPayloads())) {
      const s = JSON.stringify(payload)
      assert.equal(/EGP|currency|amount|grandTotal|contractValue/i.test(s), false, `${name} exposed a money field`)
    }
  })

  test('the project manager display name is present, and nothing else about them (D2)', async () => {
    const { dashboard } = await allPayloads()
    const card = dashboard.projects[0]
    assert.ok(card)
    assert.deepEqual(card.projectManager, { known: true, value: 'Fixture PM' })
    assert.equal(/email|phone|employee/i.test(JSON.stringify(card)), false)
  })

  test('rework surfaces as a neutral status with no reason (PDF §4)', async () => {
    const detail = (await allPayloads())['project-detail A2']
    assert.ok(detail)
    const reworked = detail.items.find((i) => i.milestones[3]?.status.known === true && i.milestones[3].status.value === 'rework_in_progress')
    assert.ok(reworked, 'the fixture has a line in rework')
    assert.equal(/reason.*quality|comment|disassembl/i.test(JSON.stringify(reworked)), false)
  })

  test('a supplier part number is withheld on component lines', async () => {
    const detail = (await allPayloads())['project-detail A1']
    assert.ok(detail)
    const component = detail.items.find((i) => i.itemClass === 'supplied_component')
    assert.ok(component, 'the fixture has a component line')
    assert.equal(component.itemCode.known, false)
    assert.equal(JSON.stringify(component).includes('1SDA'), false)
  })

  test('the On Hold flag never reaches a payload (D4)', async () => {
    for (const payload of Object.values(await allPayloads())) {
      assert.equal(/onHold|on_hold/i.test(JSON.stringify(payload)), false)
    }
  })

  test('no internal cycle-time KPI reaches a payload', async () => {
    for (const payload of Object.values(await allPayloads())) {
      assert.equal(/mainDays|reworkDays|"t[1-8]/i.test(JSON.stringify(payload)), false)
    }
  })
})

describe('honest unavailability instead of false zeros', () => {
  test('finance and documents are declared unavailable, not empty', async () => {
    const { dashboard } = await allPayloads()
    assert.deepEqual(dashboard.unavailable.finance, { code: 'source.no_finance_data', scope: 'finance' })
    assert.deepEqual(dashboard.unavailable.documents, { code: 'source.no_document_data', scope: 'documents' })
  })

  test('delivered item count is unknown, never 0', async () => {
    const { dashboard } = await allPayloads()
    assert.equal(dashboard.summary.itemsDelivered.known, false)
    const detail = (await allPayloads())['project-detail A1']
    assert.equal(detail?.project.itemCounts.delivered.known, false)
  })

  test('the provisional tenant identity is surfaced, not hidden (D1)', async () => {
    const { dashboard } = await allPayloads()
    assert.deepEqual(dashboard.unavailable.identity, {
      code: 'source.provisional_identity',
      scope: 'identity',
    })
  })

  test('a FAT milestone reports its outcome as unobservable', async () => {
    const detail = (await allPayloads())['project-detail A1']
    const item = detail?.items.find((i) => i.hasProductionJourney)
    assert.ok(item)
    const fat = item.milestones.find((m) => m.stage === 4)
    assert.equal(fat?.outcomeObservable, false)
  })

  test('progress always carries the stages it covers', async () => {
    const { dashboard } = await allPayloads()
    for (const card of dashboard.projects) {
      assert.ok(Array.isArray(card.progress.basis))
      if (card.progress.percent.known) {
        assert.ok(card.progress.basis.length > 0, 'a percentage without a basis is unrenderable honestly')
        assert.deepEqual([...card.progress.basis], [1, 2, 3])
      }
    }
  })

  test('internal Unknown notes are not forwarded to the browser', async () => {
    // `Unknown.note` names ERPNext fields; only the machine `reason` should travel.
    for (const payload of Object.values(await allPayloads())) {
      const s = JSON.stringify(payload)
      assert.equal(s.includes('"note"'), false)
      assert.equal(/work_order\.|custom_|rfd\./.test(s), false)
    }
  })
})
