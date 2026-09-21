// app/store.js — storage abstraction.
//
// One interface, two backends. A PostgreSQL backend is the third
// implementation for the Docker deployment and is the only file that changes.

import { uid, nowIso } from './util.js';

export const COLLECTIONS = Object.freeze([
  'projects',
  'documents',
  'extracted_fields',
  'field_conflicts',
  'process_steps',
  'equipment',
  'chemicals',
  'chem_properties',
  'nodes',
  'scenarios',
  'safeguards',
  'recommendations',
  'team_members',
  'workshop_sessions',
  'assumptions',
  'data_gaps',
  'sources',
  'compliance',
  'permits',
  'permit_conditions',
  'compliance_tasks',
  'compliance_evidence',
  'legal_thresholds',
  'legal_updates',
  'legal_node_links',
  'risk_matrices',
  'ai_runs',
  'chat_actions',
  'research_queries',
  'research_findings',
  'company_profile',
  'reasoning_runs',
  'report_versions',
  'audit',
]);

export class MemoryBackend {
  constructor() {
    this.kind = 'memory';
    this.data = new Map();
    this.listeners = new Map();
  }

  _col(name) {
    if (!this.data.has(name)) this.data.set(name, new Map());
    return this.data.get(name);
  }

  async list(name) {
    return Array.from(this._col(name).values());
  }

  async get(name, id) {
    return this._col(name).get(id) || null;
  }

  async put(name, id, rec) {
    this._col(name).set(id, rec);
    this._emit(name);
  }

  async patch(name, id, partial) {
    const cur = this._col(name).get(id) || {};
    this._col(name).set(id, Object.assign({}, cur, partial));
    this._emit(name);
  }

  async remove(name, id) {
    this._col(name).delete(id);
    this._emit(name);
  }

  subscribe(name, handler) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(handler);
    this.list(name).then(handler);
    return () => this.listeners.get(name).delete(handler);
  }

  _emit(name) {
    const set = this.listeners.get(name);
    if (!set) return;
    const rows = Array.from(this._col(name).values());
    for (const fn of set) fn(rows);
  }
}

export class ArtifactDbBackend {
  constructor(db) {
    this.kind = 'db';
    this.db = db;
    this.cache = new Map();
    this.unsubs = new Map();
  }

  async list(name) {
    if (this.cache.has(name)) return Array.from(this.cache.get(name).values());
    const snap = await this.db.collection(name).get();
    const m = new Map();
    for (const d of snap.docs) m.set(d.id, Object.assign({ id: d.id }, d.data()));
    this.cache.set(name, m);
    return Array.from(m.values());
  }

  async get(name, id) {
    const snap = await this.db.doc(name + '/' + id).get();
    if (!snap.exists) return null;
    return Object.assign({ id }, snap.data());
  }

  async put(name, id, rec) {
    const body = Object.assign({}, rec);
    delete body.id;
    await this.db.doc(name + '/' + id).set(body);
    if (this.cache.has(name)) this.cache.get(name).set(id, Object.assign({ id }, body));
  }

  async patch(name, id, partial) {
    const body = Object.assign({}, partial);
    delete body.id;
    try {
      await this.db.doc(name + '/' + id).update(body);
    } catch (e) {
      // update() requires the document to exist; fall back to a full write.
      if (e && e.code === 'invalid_argument') {
        const cur = (await this.get(name, id)) || {};
        await this.put(name, id, Object.assign({}, cur, body));
        return;
      }
      throw e;
    }
    if (this.cache.has(name)) {
      const cur = this.cache.get(name).get(id) || { id };
      this.cache.get(name).set(id, Object.assign({}, cur, body));
    }
  }

  async remove(name, id) {
    await this.db.doc(name + '/' + id).delete();
    if (this.cache.has(name)) this.cache.get(name).delete(id);
  }

  // One subscription per collection, kept for the life of the page.
  subscribe(name, handler) {
    if (!this.unsubs.has(name)) {
      const handlers = new Set();
      const unsub = this.db.collection(name).onSnapshot(
        (snap) => {
          const m = new Map();
          for (const d of snap.docs) m.set(d.id, Object.assign({ id: d.id }, d.data()));
          this.cache.set(name, m);
          const rows = Array.from(m.values());
          for (const fn of handlers) fn(rows);
        },
        (err) => {
          // A terminal subscription error leaves the cache in place; the app
          // keeps working read-only from what it already has.
          if (window.__HAZOP_ON_DB_ERROR) window.__HAZOP_ON_DB_ERROR(name, err);
        }
      );
      this.unsubs.set(name, { unsub, handlers });
    }
    const entry = this.unsubs.get(name);
    entry.handlers.add(handler);
    if (this.cache.has(name)) handler(Array.from(this.cache.get(name).values()));
    return () => entry.handlers.delete(handler);
  }
}

/**
 * The store: a thin record-lifecycle layer over a backend.
 * Handles ids, timestamps, revisions and the audit trail so no view has to.
 */
export class Store {
  constructor(backend, opts) {
    this.backend = backend;
    this.actor = (opts && opts.actor) || { id: 'local', name: 'Local user', role: 'admin' };
    this.readOnly = !!(opts && opts.readOnly);
    this.onAudit = (opts && opts.onAudit) || null;
  }

  get kind() {
    return this.backend.kind;
  }

  setActor(actor) {
    this.actor = actor;
  }

  list(name) {
    return this.backend.list(name);
  }

  get(name, id) {
    return this.backend.get(name, id);
  }

  subscribe(name, handler) {
    return this.backend.subscribe(name, handler);
  }

  async create(name, rec, meta) {
    this._assertWritable();
    const id = rec.id || uid(name.slice(0, 4));
    const full = Object.assign({}, rec, {
      id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      rev: 1,
      createdBy: this.actor.id,
    });
    await this.backend.put(name, id, full);
    await this._audit('CREATE', name, id, null, full, meta);
    return full;
  }

  async update(name, id, partial, meta) {
    this._assertWritable();
    const before = await this.backend.get(name, id);
    const patch = Object.assign({}, partial, {
      updatedAt: nowIso(),
      rev: ((before && before.rev) || 1) + 1,
      updatedBy: this.actor.id,
    });
    await this.backend.patch(name, id, patch);
    await this._audit('UPDATE', name, id, before, Object.assign({}, before, patch), meta);
    return Object.assign({}, before, patch);
  }

  async replace(name, id, rec, meta) {
    this._assertWritable();
    const before = await this.backend.get(name, id);
    const full = Object.assign({}, rec, {
      id,
      createdAt: (before && before.createdAt) || nowIso(),
      updatedAt: nowIso(),
      rev: ((before && before.rev) || 1) + 1,
      updatedBy: this.actor.id,
    });
    await this.backend.put(name, id, full);
    await this._audit('REPLACE', name, id, before, full, meta);
    return full;
  }

  async remove(name, id, meta) {
    this._assertWritable();
    const before = await this.backend.get(name, id);
    await this.backend.remove(name, id);
    await this._audit('DELETE', name, id, before, null, meta);
  }

  _assertWritable() {
    if (this.readOnly) {
      const e = new Error('This view is read-only.');
      e.code = 'read_only';
      throw e;
    }
  }

  // Audit entries are bucketed one document per project per day so the store's
  // document budget is not consumed by the log.
  async _audit(action, entityKind, entityId, before, after, meta) {
    const m = meta || {};
    const projectId = m.projectId || (after && after.projectId) || (before && before.projectId) || 'global';
    if (entityKind === 'audit' || entityKind === 'ai_runs') return;
    const day = new Date().toISOString().slice(0, 10);
    const bucketId = projectId + '_' + day;
    const entry = {
      at: nowIso(),
      actor: this.actor.name || this.actor.id,
      actorId: this.actor.id,
      actorKind: m.actorKind || 'human',
      action,
      entity: entityKind,
      entityId,
      field: m.field || null,
      before: slim(before, m.field),
      after: slim(after, m.field),
      aiRunId: m.aiRunId || null,
      note: m.note || null,
      sourceRefs: m.sourceRefs || [],
    };
    try {
      const cur = await this.backend.get('audit', bucketId);
      if (cur) {
        const entries = (cur.entries || []).concat([entry]);
        // One bucket stays well inside the 256 KiB document cap.
        const trimmed = entries.length > 400 ? entries.slice(entries.length - 400) : entries;
        await this.backend.patch('audit', bucketId, { entries: trimmed, count: (cur.count || 0) + 1, updatedAt: nowIso() });
      } else {
        await this.backend.put('audit', bucketId, { id: bucketId, projectId, day, entries: [entry], count: 1, createdAt: nowIso(), updatedAt: nowIso() });
      }
    } catch (e) {
      // The audit write must never break the user's edit; surface it instead.
      if (window.__HAZOP_ON_DB_ERROR) window.__HAZOP_ON_DB_ERROR('audit', e);
    }
    if (this.onAudit) this.onAudit(entry);
  }
}

// Keep audit payloads small and readable: for a field edit, record just that
// field; otherwise record a short summary of the record.
function slim(rec, field) {
  if (!rec) return null;
  if (field) {
    const out = {};
    out[field] = rec[field];
    return out;
  }
  const keep = ['id', 'name', 'title', 'tag', 'nodeNumber', 'recId', 'canonicalName', 'projectName', 'status', 'reviewStatus', 'applicabilityStatus', 'complianceStatus', 'deviation', 'text', 'value', 'field'];
  const out = {};
  for (const k of keep) if (rec[k] !== undefined) out[k] = typeof rec[k] === 'string' ? rec[k].slice(0, 200) : rec[k];
  return out;
}

/** Resolve the best available backend for this view. */
export async function openStore(onStatus) {
  const caps = window.__HAZOP_CAPS || {};
  if (caps.db) {
    onStatus && onStatus({ kind: 'db', message: 'Connected to the shared project store.' });
    return new Store(new ArtifactDbBackend(caps.db), { readOnly: caps.readOnly });
  }
  onStatus &&
    onStatus({
      kind: 'memory',
      message: 'Working in this browser tab only — nothing is saved. Open the published page while signed in to use the shared project store.',
    });
  return new Store(new MemoryBackend(), {});
}
