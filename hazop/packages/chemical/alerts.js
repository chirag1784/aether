// packages/chemical/alerts.js
// Process-vs-property reasoning. Deterministic comparisons only.
// An alert is emitted ONLY when both sides have a usable status. A missing
// property produces a data gap, never a "no hazard" conclusion.

import { isUsable } from '../domain/status.js';
import { toCelsius, toBar, comparePressure } from '../calculations/units.js';
import { propertyMeta } from './properties.js';

export const ALERTS_VERSION = 'alerts-1.0.0';

const NEAR_FLASH_K = 10; // margin below flash point that is still an alert
const NEAR_DECOMP_K = 25; // margin below decomposition onset

function prop(props, chemId, key) {
  return (props || []).filter((p) => p.chemicalId === chemId && p.key === key)[0] || null;
}

function usableNumber(p) {
  if (!p) return null;
  if (!isUsable(p.status)) return null;
  const n = Number(p.value);
  return Number.isFinite(n) ? n : null;
}

function usableBool(p) {
  if (!p || !isUsable(p.status)) return null;
  return p.value === true || p.value === 'true' || p.value === 'yes';
}

function usableList(p) {
  if (!p || !isUsable(p.status)) return null;
  if (Array.isArray(p.value)) return p.value;
  if (typeof p.value === 'string') return p.value.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return null;
}

function tempC(value, unit) {
  const r = toCelsius(value, unit || 'C');
  return r.ok ? r.value : null;
}

function gap(chemId, chemName, nodeId, propKey, blocks) {
  return {
    kind: 'DATA_GAP',
    chemicalId: chemId,
    chemicalName: chemName,
    nodeId,
    property: propKey,
    propertyLabel: (propertyMeta(propKey) || {}).label || propKey,
    blocks,
    detail: 'No usable value for ' + ((propertyMeta(propKey) || {}).label || propKey) + '. Attach an SDS or mark it not applicable with a reason.',
    resolveWith: ['SDS', 'MANUFACTURER_DATA', 'REGULATOR_DB', 'SCIENTIFIC_DB'],
  };
}

function alert(spec) {
  return Object.assign(
    {
      kind: 'ALERT',
      engine: ALERTS_VERSION,
      severity: 'REVIEW',
      // The mandated presentation shape (MASTER_STRUCTURE §7.3)
      chain: {
        fact: spec.fact,
        source: spec.source,
        processContext: spec.processContext,
        mechanism: spec.mechanism,
        node: spec.nodeLabel,
        review: spec.review,
      },
    },
    spec
  );
}

function refsOf(p) {
  return (p && p.sourceRefs) || [];
}

function srcLabel(p) {
  if (!p) return 'no source';
  const r = refsOf(p)[0];
  if (!r) return p.status + ' (no citation recorded)';
  return [r.sourceLabel || r.sourceType || 'source', r.documentName, r.page ? 'p.' + r.page : null, r.retrievedAt || r.extractedAt].filter(Boolean).join(' · ');
}

/**
 * Run every rule for one node.
 *
 * @param {Object} req { node, equipment[], chemicals[], chemProperties[], safeguards[] }
 * @returns {Object} { alerts: [...], gaps: [...] }
 */
export function runNodeAlerts(req) {
  const r = req || {};
  const node = r.node || {};
  const nodeLabel = 'Node ' + (node.nodeNumber || node.id || '?') + (node.worksheetName ? ' — ' + node.worksheetName : '');
  const eq = (r.equipment || []).filter((e) => (node.equipmentIds || []).indexOf(e.id) !== -1);
  const chems = (r.chemicals || []).filter((c) => (node.chemicalIds || []).indexOf(c.id) !== -1);
  const props = r.chemProperties || [];
  const alerts = [];
  const gaps = [];

  const opT = tempC(node.operatingTemperature, node.operatingTemperatureUnit);
  const opTmax = tempC(node.operatingTemperatureMax, node.operatingTemperatureUnit);
  const processT = opTmax !== null ? opTmax : opT;

  for (const ch of chems) {
    const name = ch.canonicalName || ch.name || ch.id;

    // --- flash point -------------------------------------------------------
    const fpP = prop(props, ch.id, 'flashPoint');
    const fp = usableNumber(fpP);
    if (fp === null) {
      if (processT !== null) gaps.push(gap(ch.id, name, node.id, 'flashPoint', ['TEMP_ABOVE_FLASH', 'TEMP_NEAR_FLASH', 'STATIC_CREDIBLE']));
    } else if (processT !== null) {
      if (processT >= fp) {
        alerts.push(
          alert({
            rule: 'TEMP_ABOVE_FLASH',
            severity: 'HIGH',
            chemicalId: ch.id,
            chemicalName: name,
            nodeId: node.id,
            nodeLabel,
            title: name + ' handled at or above its flash point',
            fact: 'Flash point of ' + name + ' = ' + fp + ' °C',
            source: srcLabel(fpP),
            processContext: 'Node operating temperature ' + processT + ' °C',
            mechanism: 'A flammable atmosphere can exist in the vapour space and at any opening; an ignition source is then sufficient for a fire or deflagration.',
            review: 'Confirm inerting, vapour containment and ignition-source control for this node, and record the basis in the worksheet.',
            arithmetic: processT + ' °C >= ' + fp + ' °C',
            sourceRefs: refsOf(fpP),
            suggestParameters: [{ parameter: 'temperature', guideword: 'MORE' }, { parameter: 'staticCharge', guideword: 'AS_WELL_AS' }],
          })
        );
      } else if (processT >= fp - NEAR_FLASH_K) {
        alerts.push(
          alert({
            rule: 'TEMP_NEAR_FLASH',
            severity: 'MEDIUM',
            chemicalId: ch.id,
            chemicalName: name,
            nodeId: node.id,
            nodeLabel,
            title: 'Small margin to the flash point of ' + name,
            fact: 'Flash point of ' + name + ' = ' + fp + ' °C',
            source: srcLabel(fpP),
            processContext: 'Node operating temperature ' + processT + ' °C (margin ' + (fp - processT).toFixed(1) + ' K)',
            mechanism: 'A temperature excursion of less than ' + NEAR_FLASH_K + ' K produces a flammable atmosphere.',
            review: 'Check the high-temperature alarm / trip setting against this margin.',
            arithmetic: processT + ' °C >= ' + fp + ' - ' + NEAR_FLASH_K + ' °C',
            sourceRefs: refsOf(fpP),
            suggestParameters: [{ parameter: 'temperature', guideword: 'MORE' }],
          })
        );
      }
    }

    // --- boiling point -----------------------------------------------------
    const bpP = prop(props, ch.id, 'boilingPoint');
    const bp = usableNumber(bpP);
    if (bp !== null && processT !== null && processT >= bp) {
      alerts.push(
        alert({
          rule: 'TEMP_ABOVE_BOILING',
          severity: 'HIGH',
          chemicalId: ch.id,
          chemicalName: name,
          nodeId: node.id,
          nodeLabel,
          title: name + ' at or above its boiling point',
          fact: 'Boiling point of ' + name + ' = ' + bp + ' °C',
          source: srcLabel(bpP),
          processContext: 'Node operating temperature ' + processT + ' °C',
          mechanism: 'Rapid vaporization raises pressure in a closed system and can overpressure the vessel or discharge through the vent.',
          review: 'Verify the relief and vent arrangement against the vaporization rate, and confirm the design pressure.',
          arithmetic: processT + ' °C >= ' + bp + ' °C',
          sourceRefs: refsOf(bpP),
          suggestParameters: [{ parameter: 'pressure', guideword: 'MORE' }, { parameter: 'temperature', guideword: 'MORE' }],
        })
      );
    }

    // --- decomposition -----------------------------------------------------
    const dcP = prop(props, ch.id, 'decompositionTemperature');
    const dc = usableNumber(dcP);
    if (dc === null && processT !== null && (node.isReactionStep || node.hasHeating || eq.some((e) => e.heatingSystem))) {
      gaps.push(gap(ch.id, name, node.id, 'decompositionTemperature', ['TEMP_ABOVE_DECOMP', 'TEMP_NEAR_DECOMP']));
    } else if (dc !== null && processT !== null) {
      if (processT >= dc) {
        alerts.push(
          alert({
            rule: 'TEMP_ABOVE_DECOMP',
            severity: 'CRITICAL',
            chemicalId: ch.id,
            chemicalName: name,
            nodeId: node.id,
            nodeLabel,
            title: name + ' handled at or above its decomposition onset',
            fact: 'Decomposition onset of ' + name + ' = ' + dc + ' °C',
            source: srcLabel(dcP),
            processContext: 'Node operating temperature ' + processT + ' °C',
            mechanism: 'Self-heating decomposition can run away, generating gas and pressure faster than a conventional relief can handle.',
            review: 'This needs a thermal-stability assessment (DSC / ARC data) and a relief sizing basis for the decomposition case, not only a HAZOP row.',
            arithmetic: processT + ' °C >= ' + dc + ' °C',
            sourceRefs: refsOf(dcP),
            suggestParameters: [{ parameter: 'temperature', guideword: 'MORE' }, { parameter: 'reaction', guideword: 'OTHER_THAN' }],
          })
        );
      } else if (processT >= dc - NEAR_DECOMP_K) {
        alerts.push(
          alert({
            rule: 'TEMP_NEAR_DECOMP',
            severity: 'HIGH',
            chemicalId: ch.id,
            chemicalName: name,
            nodeId: node.id,
            nodeLabel,
            title: 'Small margin to decomposition onset for ' + name,
            fact: 'Decomposition onset of ' + name + ' = ' + dc + ' °C',
            source: srcLabel(dcP),
            processContext: 'Node operating temperature ' + processT + ' °C (margin ' + (dc - processT).toFixed(1) + ' K)',
            mechanism: 'A heating-system failure or loss of agitation can carry the mass through the onset temperature.',
            review: 'Check the maximum attainable temperature on loss of cooling, and the high-temperature trip setting.',
            arithmetic: processT + ' °C >= ' + dc + ' - ' + NEAR_DECOMP_K + ' °C',
            sourceRefs: refsOf(dcP),
            suggestParameters: [{ parameter: 'cooling', guideword: 'NO' }],
          })
        );
      }
    }

    // --- vapour pressure vs design pressure --------------------------------
    const vpP = prop(props, ch.id, 'vapourPressure');
    const vp = usableNumber(vpP);
    if (vp !== null) {
      const vpBar = toBar(vp, vpP.unit || 'bar');
      for (const e of eq) {
        if (!e.designPressure) continue;
        const dp = toBar(e.designPressure, e.designPressureUnit || 'barg');
        const cmp = comparePressure(vpBar, dp);
        if (cmp && cmp.comparable && cmp.delta > 0) {
          alerts.push(
            alert({
              rule: 'VP_EXCEEDS_DESIGN',
              severity: 'CRITICAL',
              chemicalId: ch.id,
              chemicalName: name,
              nodeId: node.id,
              nodeLabel,
              title: 'Vapour pressure of ' + name + ' exceeds the design pressure of ' + (e.tag || e.id),
              fact: 'Vapour pressure ' + vp + ' ' + (vpP.unit || 'bar') + (vpP.atTemperature ? ' at ' + vpP.atTemperature + ' °C' : ''),
              source: srcLabel(vpP),
              processContext: (e.tag || e.id) + ' design pressure ' + e.designPressure + ' ' + (e.designPressureUnit || 'barg'),
              mechanism: 'A closed vessel can reach a pressure above its design rating on temperature alone.',
              review: 'Confirm the relief set pressure and the design basis for the vessel, and record the temperature at which the vapour pressure was measured.',
              arithmetic: vpBar.value + ' bar > ' + dp.value + ' bar',
              sourceRefs: refsOf(vpP),
              suggestParameters: [{ parameter: 'pressure', guideword: 'MORE' }],
            })
          );
        } else if (cmp && !cmp.comparable) {
          gaps.push({
            kind: 'DATA_GAP',
            chemicalId: ch.id,
            chemicalName: name,
            nodeId: node.id,
            property: 'pressureBasis',
            propertyLabel: 'Pressure basis (gauge / absolute)',
            blocks: ['VP_EXCEEDS_DESIGN'],
            detail: 'Cannot compare vapour pressure with design pressure: ' + cmp.reason + '. State gauge or absolute on both values.',
            resolveWith: ['PROJECT_DOCUMENT'],
          });
        }
      }
    }

    // --- combustible dust --------------------------------------------------
    const cdP = prop(props, ch.id, 'combustibleDust');
    const cd = usableBool(cdP);
    const powderInNode = /solid|powder|granule|flake/i.test(ch.physicalState || '') || eq.some((e) => e.powderHandling);
    if (powderInNode) {
      if (cd === null) {
        gaps.push(gap(ch.id, name, node.id, 'combustibleDust', ['DUST_EXPLOSION_CREDIBLE']));
      } else if (cd === true) {
        const kst = usableNumber(prop(props, ch.id, 'kst'));
        const mie = usableNumber(prop(props, ch.id, 'mie'));
        alerts.push(
          alert({
            rule: 'DUST_EXPLOSION_CREDIBLE',
            severity: 'HIGH',
            chemicalId: ch.id,
            chemicalName: name,
            nodeId: node.id,
            nodeLabel,
            title: 'Combustible dust handled in this node',
            fact: name + ' has combustible-dust evidence' + (kst !== null ? ' (Kst ' + kst + ' bar·m/s)' : '') + (mie !== null ? ', MIE ' + mie + ' mJ' : ''),
            source: srcLabel(cdP),
            processContext: 'Powder / granular handling in ' + (eq.map((e) => e.tag || e.id).join(', ') || 'this node'),
            mechanism: 'A dust cloud in a confined volume with an ignition source can deflagrate; an unrelieved enclosure then fails.',
            review: 'Confirm dust-cloud control, ignition-source control (including static), and whether explosion protection is required for the enclosure.',
            sourceRefs: refsOf(cdP),
            suggestParameters: [{ parameter: 'staticCharge', guideword: 'AS_WELL_AS' }, { parameter: 'ventilation', guideword: 'NO' }],
          })
        );
      }
    }

    // --- static ------------------------------------------------------------
    const lowCond = usableBool(prop(props, ch.id, 'conductivityLow'));
    const staticCredible = (powderInNode && cd === true) || (lowCond === true && fp !== null && processT !== null && processT >= fp - NEAR_FLASH_K);
    if (staticCredible && (node.hasCharging || node.hasTransfer)) {
      const hasEarthing = (r.safeguards || []).some((s) => s.nodeId === node.id && /earth|ground|bond/i.test(s.text || ''));
      alerts.push(
        alert({
          rule: 'STATIC_CREDIBLE',
          severity: hasEarthing ? 'MEDIUM' : 'HIGH',
          chemicalId: ch.id,
          chemicalName: name,
          nodeId: node.id,
          nodeLabel,
          title: 'Static ignition credible during charging / transfer',
          fact: powderInNode ? name + ' is a combustible powder' : name + ' is a low-conductivity liquid handled near its flash point',
          source: srcLabel(powderInNode ? cdP : prop(props, ch.id, 'conductivityLow')),
          processContext: 'Charging or transfer operation in ' + (eq.map((e) => e.tag || e.id).join(', ') || 'this node'),
          mechanism: 'Charge separation during pouring or pneumatic transfer can produce a brush or cone discharge with enough energy to ignite the atmosphere.',
          review: hasEarthing
            ? 'Earthing and bonding are recorded on this node; confirm the grounding-resistance verification interval and that it covers drums, hoses and the operator.'
            : 'No earthing or bonding safeguard is recorded on this node. Confirm the arrangement and add it to the worksheet.',
          sourceRefs: refsOf(cdP),
          suggestParameters: [{ parameter: 'staticCharge', guideword: 'AS_WELL_AS' }],
        })
      );
    }

    // --- MOC compatibility -------------------------------------------------
    const incMocP = prop(props, ch.id, 'incompatibleMoc');
    const incMoc = usableList(incMocP);
    if (incMoc) {
      for (const e of eq) {
        const moc = String(e.materialOfConstruction || '');
        if (!moc) continue;
        const hit = incMoc.filter((m) => moc.toLowerCase().indexOf(String(m).toLowerCase()) !== -1)[0];
        if (hit) {
          alerts.push(
            alert({
              rule: 'MOC_INCOMPATIBLE',
              severity: 'HIGH',
              chemicalId: ch.id,
              chemicalName: name,
              nodeId: node.id,
              nodeLabel,
              title: name + ' is incompatible with the material of construction of ' + (e.tag || e.id),
              fact: name + ' is incompatible with ' + hit,
              source: srcLabel(incMocP),
              processContext: (e.tag || e.id) + ' material of construction: ' + moc,
              mechanism: 'Corrosion or attack of the containment boundary leads to loss of containment.',
              review: 'Confirm the material selection against the supplier SDS and the service conditions.',
              sourceRefs: refsOf(incMocP),
              suggestParameters: [{ parameter: 'transfer', guideword: 'OTHER_THAN' }],
            })
          );
        }
      }
    }
  }

  // --- chemical-chemical incompatibility within the node --------------------
  for (let i = 0; i < chems.length; i += 1) {
    for (let j = i + 1; j < chems.length; j += 1) {
      const a = chems[i];
      const b = chems[j];
      const aP = prop(props, a.id, 'incompatibleMaterials');
      const bP = prop(props, b.id, 'incompatibleMaterials');
      const aList = usableList(aP) || [];
      const bList = usableList(bP) || [];
      const aName = a.canonicalName || a.name || a.id;
      const bName = b.canonicalName || b.name || b.id;
      const aHits = aList.filter((x) => matchesChem(x, b));
      const bHits = bList.filter((x) => matchesChem(x, a));
      if (aHits.length || bHits.length) {
        const src = aHits.length ? aP : bP;
        alerts.push(
          alert({
            rule: 'INCOMPATIBLE_COLOCATED',
            severity: 'HIGH',
            chemicalId: a.id,
            chemicalName: aName + ' + ' + bName,
            nodeId: node.id,
            nodeLabel,
            title: aName + ' and ' + bName + ' are incompatible and both present in this node',
            fact: (aHits.length ? aName + ' lists ' + aHits.join(', ') : bName + ' lists ' + bHits.join(', ')) + ' as incompatible',
            source: srcLabel(src),
            processContext: 'Both materials are charged to or present in ' + (eq.map((e) => e.tag || e.id).join(', ') || 'this node'),
            mechanism: 'Unintended contact — wrong charging order, cross-contamination or residue — can produce a hazardous reaction.',
            review: 'Confirm the charging sequence, the interlocks or procedural controls that enforce it, and the cleaning regime between batches.',
            sourceRefs: refsOf(src),
            suggestParameters: [{ parameter: 'charging', guideword: 'BEFORE' }, { parameter: 'composition', guideword: 'AS_WELL_AS' }],
          })
        );
      }
    }
  }

  // --- exotherm vs cooling --------------------------------------------------
  if (node.isReactionStep && node.exothermic) {
    const coolingSafeguard = (r.safeguards || []).some((s) => s.nodeId === node.id && /cool|chill|brine|quench|jacket/i.test(s.text || ''));
    const hasCoolingSystem = eq.some((e) => e.coolingSystem) || (node.utilities || []).some((u) => ['coolingWater', 'chilledWater', 'brine'].indexOf(u) !== -1);
    if (!hasCoolingSystem || !coolingSafeguard) {
      alerts.push(
        alert({
          rule: 'EXOTHERM_VS_COOLING',
          severity: 'HIGH',
          chemicalId: null,
          chemicalName: null,
          nodeId: node.id,
          nodeLabel,
          title: 'Exothermic step with no recorded cooling safeguard',
          fact: 'The node is declared an exothermic reaction step',
          source: 'Project node record',
          processContext: hasCoolingSystem ? 'A cooling system exists but no cooling safeguard is recorded on the node' : 'No cooling system is declared on the node',
          mechanism: 'Heat generation exceeding the removal capacity raises temperature, which raises the rate — a runaway.',
          review: 'Record the heat-of-reaction basis, the cooling capacity, the maximum attainable temperature on loss of cooling, and the safeguard that detects it.',
          suggestParameters: [{ parameter: 'cooling', guideword: 'NO' }, { parameter: 'reaction', guideword: 'MORE' }],
        })
      );
    }
  }

  return { alerts, gaps, engine: ALERTS_VERSION, nodeId: node.id };
}

function matchesChem(incompatibilityText, chem) {
  const t = String(incompatibilityText || '').toLowerCase().trim();
  if (!t) return false;
  const names = [chem.canonicalName, chem.name].concat(chem.synonyms || []).filter(Boolean).map((s) => String(s).toLowerCase());
  for (const n of names) {
    if (!n) continue;
    if (t.indexOf(n) !== -1 || n.indexOf(t) !== -1) return true;
  }
  // class-level matches
  const classes = [
    [/\bacids?\b/, /acid/],
    [/\bbases?\b|\balkal/, /hydroxide|amine|base/],
    [/\boxidi[sz]/, /peroxide|nitrate|chlorate|permanganate/],
    [/\bwater\b|\bmoisture\b/, /^water$/],
  ];
  for (const [inc, chemRe] of classes) {
    if (inc.test(t) && names.some((n) => chemRe.test(n))) return true;
  }
  return false;
}

/** Run alerts across every node and aggregate. */
export function runProjectAlerts(req) {
  const r = req || {};
  const alerts = [];
  const gaps = [];
  for (const node of r.nodes || []) {
    const out = runNodeAlerts({
      node,
      equipment: r.equipment,
      chemicals: r.chemicals,
      chemProperties: r.chemProperties,
      safeguards: r.safeguards,
    });
    alerts.push.apply(alerts, out.alerts);
    gaps.push.apply(gaps, out.gaps);
  }
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, REVIEW: 3 };
  alerts.sort((a, b) => (order[a.severity] === undefined ? 9 : order[a.severity]) - (order[b.severity] === undefined ? 9 : order[b.severity]));
  return { alerts, gaps: dedupeGaps(gaps), engine: ALERTS_VERSION };
}

function dedupeGaps(gaps) {
  const seen = new Map();
  for (const g of gaps) {
    const k = (g.chemicalId || '') + '|' + g.property;
    if (!seen.has(k)) seen.set(k, Object.assign({}, g, { nodeIds: [g.nodeId] }));
    else {
      const e = seen.get(k);
      if (e.nodeIds.indexOf(g.nodeId) === -1) e.nodeIds.push(g.nodeId);
    }
  }
  return Array.from(seen.values());
}
