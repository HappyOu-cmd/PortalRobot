import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const stringify = (value) => JSON.stringify(value ?? null);
const parse = (value) => value ? JSON.parse(value) : null;

const scenarioRow = (row) => row && ({
  id: Number(row.id), name: row.name, description: row.description ?? '',
  schemaVersion: Number(row.schema_version), initialState: parse(row.initial_state_json),
  expectations: parse(row.expectations_json), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
});
const caseRow = (row) => row && ({
  id: Number(row.id), runId: Number(row.run_id), caseIndex: Number(row.case_index), name: row.name,
  status: row.status, stage: row.stage, reason: row.reason, durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
  snapshot: parse(row.snapshot_json), scenario: parse(row.scenario_json), createdAt: Number(row.created_at),
});
const runRow = (row, cases = undefined) => row && ({
  id: Number(row.id), suite: row.suite, environment: row.environment, robotInterface: row.robot_interface,
  speedProfile: row.speed_profile, seed: Number(row.seed), requestedCount: Number(row.requested_count),
  status: row.status, stage: row.stage, currentCase: Number(row.current_case), totalCases: Number(row.total_cases),
  passed: Number(row.passed), failed: Number(row.failed), abortRequested: Boolean(row.abort_requested),
  error: row.error, startedAt: Number(row.started_at), finishedAt: row.finished_at === null ? null : Number(row.finished_at),
  lastFailure: row.last_failure_reason ?? cases?.filter((item) => item.status === 'FAIL').at(-1)?.reason ?? null,
  config: parse(row.config_json), ...(cases ? { cases } : {}),
});

export class TestStore {
  constructor(databasePath = ':memory:') {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS test_scenario (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '',
        schema_version INTEGER NOT NULL, initial_state_json TEXT NOT NULL, expectations_json TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS test_run (
        id INTEGER PRIMARY KEY, suite TEXT NOT NULL, environment TEXT NOT NULL, robot_interface TEXT NOT NULL,
        speed_profile TEXT NOT NULL, seed INTEGER NOT NULL, requested_count INTEGER NOT NULL,
        status TEXT NOT NULL, stage TEXT NOT NULL, current_case INTEGER NOT NULL DEFAULT 0,
        total_cases INTEGER NOT NULL DEFAULT 0, passed INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
        abort_requested INTEGER NOT NULL DEFAULT 0, error TEXT, started_at INTEGER NOT NULL, finished_at INTEGER,
        config_json TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS test_case_result (
        id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES test_run(id) ON DELETE CASCADE,
        case_index INTEGER NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, stage TEXT, reason TEXT,
        duration_ms INTEGER, snapshot_json TEXT, scenario_json TEXT, created_at INTEGER NOT NULL,
        UNIQUE(run_id, case_index)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_test_run_started ON test_run(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_test_case_run ON test_case_result(run_id, case_index);
    `);
  }

  listScenarios() { return this.db.prepare('SELECT * FROM test_scenario ORDER BY name').all().map(scenarioRow); }
  getScenario(id) { return scenarioRow(this.db.prepare('SELECT * FROM test_scenario WHERE id = ?').get(Number(id))); }
  saveScenario(input, id = null) {
    const now = Date.now();
    const name = String(input.name ?? '').trim();
    if (!name) throw new Error('Укажите имя сценария');
    const initialState = input.initialState;
    if (!initialState || !Array.isArray(initialState.slots) || initialState.slots.length !== 120) throw new Error('Сценарий должен содержать 120 слотов Zone 2');
    if (id === null) {
      const result = this.db.prepare(`INSERT INTO test_scenario
        (name, description, schema_version, initial_state_json, expectations_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(name, String(input.description ?? ''), Number(input.schemaVersion ?? 1), stringify(initialState), stringify(input.expectations ?? {}), now, now);
      return this.getScenario(result.lastInsertRowid);
    }
    this.db.prepare(`UPDATE test_scenario SET name=?, description=?, schema_version=?, initial_state_json=?,
      expectations_json=?, updated_at=? WHERE id=?`).run(name, String(input.description ?? ''), Number(input.schemaVersion ?? 1), stringify(initialState), stringify(input.expectations ?? {}), now, Number(id));
    return this.getScenario(id);
  }
  deleteScenario(id) { return this.db.prepare('DELETE FROM test_scenario WHERE id = ?').run(Number(id)).changes > 0; }

  createRun(config) {
    const now = Date.now();
    const result = this.db.prepare(`INSERT INTO test_run
      (suite, environment, robot_interface, speed_profile, seed, requested_count, status, stage, started_at, config_json)
      VALUES (?, ?, ?, ?, ?, ?, 'STARTING', 'launch', ?, ?)`).run(
      String(config.suite ?? 'smoke'), String(config.environment ?? 'simulation'), String(config.robotInterface ?? 'softmotion'),
      String(config.speedProfile ?? 'realtime'), Number(config.seed ?? 1), Number(config.count ?? 10), now, stringify(config),
    );
    return this.getRun(result.lastInsertRowid);
  }
  recoverInterruptedRuns(reason = 'Gateway был перезапущен во время прогона') {
    return this.db.prepare(`UPDATE test_run
      SET status='ERROR', stage='finished', error=?, finished_at=?
      WHERE finished_at IS NULL AND status IN ('STARTING', 'RUNNING', 'ABORTING')`).run(
      String(reason), Date.now(),
    ).changes;
  }
  listRuns(limit = 50) { return this.db.prepare(`SELECT test_run.*,
    (SELECT reason FROM test_case_result WHERE run_id=test_run.id AND status='FAIL' ORDER BY case_index DESC LIMIT 1) AS last_failure_reason
    FROM test_run ORDER BY started_at DESC LIMIT ?`).all(Math.max(1, Math.min(500, Number(limit)))).map((row) => runRow(row)); }
  getRun(id) {
    const row = this.db.prepare('SELECT * FROM test_run WHERE id = ?').get(Number(id));
    if (!row) return null;
    const cases = this.db.prepare('SELECT * FROM test_case_result WHERE run_id = ? ORDER BY case_index').all(Number(id)).map(caseRow);
    return runRow(row, cases);
  }
  progress(id, update) {
    this.db.prepare(`UPDATE test_run SET status=?, stage=?, current_case=?, total_cases=? WHERE id=?`).run(
      String(update.status ?? 'RUNNING'), String(update.stage ?? ''), Number(update.caseIndex ?? 0), Number(update.caseCount ?? 0), Number(id),
    );
    return this.getRun(id);
  }
  addCase(id, result) {
    this.db.prepare(`INSERT INTO test_case_result
      (run_id, case_index, name, status, stage, reason, duration_ms, snapshot_json, scenario_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, case_index) DO UPDATE SET status=excluded.status, stage=excluded.stage,
      reason=excluded.reason, duration_ms=excluded.duration_ms, snapshot_json=excluded.snapshot_json,
      scenario_json=excluded.scenario_json`).run(Number(id), Number(result.caseIndex), String(result.name ?? `Case ${result.caseIndex}`),
      String(result.status), result.stage ?? null, result.reason ?? null, result.durationMs ?? null,
      stringify(result.snapshot), stringify(result.scenario), Date.now());
    this.db.prepare(`UPDATE test_run SET passed=(SELECT COUNT(*) FROM test_case_result WHERE run_id=? AND status='PASS'),
      failed=(SELECT COUNT(*) FROM test_case_result WHERE run_id=? AND status='FAIL'), current_case=? WHERE id=?`).run(Number(id), Number(id), Number(result.caseIndex), Number(id));
    return this.getRun(id);
  }
  finishRun(id, status = null, error = null) {
    const row = this.getRun(id);
    const finalStatus = status ?? (row?.failed ? 'FAIL' : 'PASS');
    this.db.prepare('UPDATE test_run SET status=?, stage=?, error=?, finished_at=? WHERE id=?').run(finalStatus, 'finished', error, Date.now(), Number(id));
    return this.getRun(id);
  }
  requestAbort(id) { this.db.prepare("UPDATE test_run SET abort_requested=1, status='ABORTING', stage='abort' WHERE id=?").run(Number(id)); return this.getRun(id); }
  close() { this.db.close(); }
}
